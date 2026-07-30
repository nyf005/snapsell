/**
 * Test d'intégration : réservation de stock sous concurrence réelle.
 *
 * C'est la course centrale du live-commerce. Deux clientes tapent « A12 » à la
 * même seconde pour la dernière pièce ; le worker traite en `localConcurrency: 5`,
 * donc les deux messages sont réellement simultanés. Si les deux réservent, on a
 * vendu du stock qui n'existe pas — et c'est la vendeuse qui l'apprend au moment
 * de livrer.
 *
 * La protection est un `SELECT … FOR UPDATE` : un verrou de ligne Postgres.
 * **Il est par nature intestable avec un mock** — un `$queryRaw` simulé rend ce
 * qu'on lui dit de rendre, et la sérialisation des transactions, tout l'intérêt
 * du verrou, reste invisible. Le test unitaire voisin le dit lui-même :
 *
 *   reservation.test.ts:190 — « True concurrency would require an integration
 *   test with a real DB. »
 *
 * C'est ce fichier. Chaque test lance de vrais appels en parallèle sur une vraie
 * base et vérifie l'invariant après coup, pas le chemin pris pour y arriver.
 *
 * Nécessite DATABASE_URL.
 * Exécution : RUN_INTEGRATION_TESTS=true npx vitest run reservation.integration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("~/lib/logger", () => ({
  workerLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const shouldRun =
  process.env.RUN_INTEGRATION_TESTS === "true" && !!process.env.DATABASE_URL;

describe.skipIf(!shouldRun)("réservation de stock — concurrence réelle", () => {
  let db: typeof import("~/server/db").db;
  let reserveUnits: typeof import("./reservation").reserveUnits;
  let releaseReservation: typeof import("./reservation").releaseReservation;
  let confirmReservation: typeof import("./reservation").confirmReservation;

  let tenantId: string;
  let liveSessionId: string;

  beforeAll(async () => {
    db = (await import("~/server/db")).db;
    const mod = await import("./reservation");
    reserveUnits = mod.reserveUnits;
    releaseReservation = mod.releaseReservation;
    confirmReservation = mod.confirmReservation;

    const tenant = await db.tenant.create({
      data: { name: "Test Tenant Reservation Concurrency" },
    });
    tenantId = tenant.id;

    const session = await db.liveSession.create({
      data: { tenantId, lastActivityAt: new Date() },
    });
    liveSessionId = session.id;
  });

  afterAll(async () => {
    if (!db || !tenantId) return;
    await db.eventLog.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await db.liveItem.deleteMany({ where: { tenantId } });
    await db.catalogueItem.deleteMany({ where: { tenantId } });
  });

  /** Crée un article live avec le stock voulu et rend son identifiant. */
  async function liveItem(availableQty: number, reservedQty = 0) {
    const item = await db.liveItem.create({
      data: {
        tenantId,
        liveSessionId,
        code: `A${Math.floor(Math.random() * 1_000_000)}`,
        quantity: availableQty,
        availableQty,
        reservedQty,
      },
    });
    return item.id;
  }

  async function stockOf(itemId: string) {
    const item = await db.liveItem.findUniqueOrThrow({ where: { id: itemId } });
    return { available: item.availableQty, reserved: item.reservedQty };
  }

  describe("reserveUnits", () => {
    /**
     * Le cas qui coûte de l'argent. Une seule pièce, cinq clientes simultanées :
     * une seule doit repartir avec, les quatre autres doivent l'apprendre tout
     * de suite plutôt qu'au moment de la livraison.
     */
    it("une seule pièce, cinq clientes simultanées : une seule réservation", async () => {
      const itemId = await liveItem(1);

      const results = await Promise.all(
        Array.from({ length: 5 }, () => reserveUnits(tenantId, itemId, 1)),
      );

      expect(results.filter((r) => r.success)).toHaveLength(1);
      const refused = results.filter((r) => !r.success);
      expect(refused).toHaveLength(4);
      expect(refused.every((r) => !r.success && r.reason === "exhausted")).toBe(true);

      expect(await stockOf(itemId)).toEqual({ available: 1, reserved: 1 });
    });

    /** Le stock réservé ne doit jamais dépasser le stock réel, quel qu'en soit le chemin. */
    it("dix demandes simultanées sur trois pièces en réservent exactement trois", async () => {
      const itemId = await liveItem(3);

      const results = await Promise.all(
        Array.from({ length: 10 }, () => reserveUnits(tenantId, itemId, 1)),
      );

      expect(results.filter((r) => r.success)).toHaveLength(3);

      const stock = await stockOf(itemId);
      expect(stock.reserved).toBe(3);
      expect(stock.reserved).toBeLessThanOrEqual(stock.available);
    });

    /** Une commande de plusieurs pièces ne doit pas passer « à moitié ». */
    it("refuse en bloc une quantité supérieure au disponible", async () => {
      const itemId = await liveItem(5);

      const results = await Promise.all([
        reserveUnits(tenantId, itemId, 3),
        reserveUnits(tenantId, itemId, 3),
      ]);

      expect(results.filter((r) => r.success)).toHaveLength(1);
      expect(await stockOf(itemId)).toEqual({ available: 5, reserved: 3 });
    });

    it("ne réserve rien sur un article d'une autre boutique", async () => {
      const itemId = await liveItem(5);
      const other = await db.tenant.create({ data: { name: "Autre boutique" } });

      const result = await reserveUnits(other.id, itemId, 1);

      expect(result).toEqual({ success: false, reason: "not_found" });
      expect((await stockOf(itemId)).reserved).toBe(0);

      await db.tenant.delete({ where: { id: other.id } });
    });
  });

  describe("confirmReservation", () => {
    /**
     * Le second garde-fou. Même si deux réservations coexistent (par exemple
     * après une libération et une reprise), une seule confirmation peut décrémenter
     * la dernière pièce : `available_qty` ne doit jamais passer sous zéro.
     */
    it("deux confirmations simultanées sur la dernière pièce : une seule gagne", async () => {
      const itemId = await liveItem(1, 2);

      const results = await Promise.all([
        confirmReservation(tenantId, itemId, 1),
        confirmReservation(tenantId, itemId, 1),
      ]);

      expect(results.filter((r) => r.success)).toHaveLength(1);
      const failed = results.find((r) => !r.success);
      expect(failed && !failed.success && failed.reason).toBe("concurrency");

      const stock = await stockOf(itemId);
      expect(stock.available).toBe(0);
      expect(stock.available).toBeGreaterThanOrEqual(0);
    });

    /** Le rollback doit être total : un échec ne laisse pas `reserved_qty` entamé. */
    it("laisse le stock intact quand la confirmation est refusée", async () => {
      const itemId = await liveItem(1, 2);

      await Promise.all([
        confirmReservation(tenantId, itemId, 1),
        confirmReservation(tenantId, itemId, 1),
      ]);

      // Une seule confirmation a abouti : une réservation consommée sur les deux.
      expect((await stockOf(itemId)).reserved).toBe(1);
    });

    it("refuse de confirmer sans réservation en cours", async () => {
      const itemId = await liveItem(5, 0);

      const result = await confirmReservation(tenantId, itemId, 1);

      expect(result).toEqual({ success: false, reason: "no_reservation" });
      expect(await stockOf(itemId)).toEqual({ available: 5, reserved: 0 });
    });
  });

  describe("releaseReservation", () => {
    it("rend les unités et permet à la suivante de réserver", async () => {
      const itemId = await liveItem(1);
      await reserveUnits(tenantId, itemId, 1);

      expect((await reserveUnits(tenantId, itemId, 1)).success).toBe(false);

      await releaseReservation(tenantId, itemId, 1);

      expect((await reserveUnits(tenantId, itemId, 1)).success).toBe(true);
      expect((await stockOf(itemId)).reserved).toBe(1);
    });

    /** `reserved_qty` négatif fausserait tous les calculs de disponibilité ensuite. */
    it("ne descend jamais sous zéro, même sous libérations simultanées", async () => {
      const itemId = await liveItem(5, 1);

      const results = await Promise.all([
        releaseReservation(tenantId, itemId, 1),
        releaseReservation(tenantId, itemId, 1),
        releaseReservation(tenantId, itemId, 1),
      ]);

      expect(results.filter((r) => r.success)).toHaveLength(1);
      const stock = await stockOf(itemId);
      expect(stock.reserved).toBe(0);
      expect(stock.reserved).toBeGreaterThanOrEqual(0);
    });
  });

  /**
   * Les variantes portent leur propre stock **et** répercutent sur l'article
   * parent. Si la cascade se perd sous concurrence, le catalogue affiche un
   * stock parent qui ne correspond plus à la somme de ses variantes.
   */
  describe("variantes — cascade vers l'article parent", () => {
    async function itemWithVariant(qty: number) {
      const parent = await db.catalogueItem.create({
        data: {
          tenantId,
          code: `C${Math.floor(Math.random() * 1_000_000)}`,
          quantity: qty,
          availableQty: qty,
          reservedQty: 0,
        },
      });
      const variant = await db.itemVariant.create({
        data: {
          tenantId,
          catalogueItemId: parent.id,
          label: "M / Rouge",
          values: { Taille: "M", Couleur: "Rouge" },
          quantity: qty,
          availableQty: qty,
          reservedQty: 0,
        },
      });
      return { parentId: parent.id, variantId: variant.id };
    }

    it("répercute chaque réservation de variante sur le parent", async () => {
      const { parentId, variantId } = await itemWithVariant(3);

      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          reserveUnits(tenantId, variantId, 1, { table: "item_variants" }),
        ),
      );

      expect(results.filter((r) => r.success)).toHaveLength(3);

      const parent = await db.catalogueItem.findUniqueOrThrow({ where: { id: parentId } });
      const variant = await db.itemVariant.findUniqueOrThrow({ where: { id: variantId } });
      expect(variant.reservedQty).toBe(3);
      expect(parent.reservedQty).toBe(variant.reservedQty);
    });

    it("décrémente parent et variante ensemble à la confirmation", async () => {
      const { parentId, variantId } = await itemWithVariant(2);
      await reserveUnits(tenantId, variantId, 1, { table: "item_variants" });

      const result = await confirmReservation(tenantId, variantId, 1, {
        table: "item_variants",
      });

      expect(result.success).toBe(true);
      const parent = await db.catalogueItem.findUniqueOrThrow({ where: { id: parentId } });
      const variant = await db.itemVariant.findUniqueOrThrow({ where: { id: variantId } });
      expect(variant.availableQty).toBe(1);
      expect(parent.availableQty).toBe(1);
      expect(parent.quantity).toBe(1);
    });
  });
});
