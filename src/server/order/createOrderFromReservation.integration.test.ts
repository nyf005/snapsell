/**
 * Test d'intégration : création de commande — rollback et numérotation réels.
 *
 * Trois garanties de ce module ne tiennent que par Postgres, et le code le
 * reconnaît lui-même :
 *
 *   createOrderFromReservation.ts:102 — « le rollback réel (Prisma + Postgres)
 *   n'est validable que par test d'intégration. »
 *
 * 1. **Le rollback global.** `confirmReservation` décrémente le stock *dans* la
 *    transaction qui crée la commande. Si la création échoue, le stock doit
 *    revenir à son état d'avant. Avec un mock, on observe qu'aucun `create`
 *    n'a eu lieu ; on n'observe pas que la ligne stock est revenue en arrière.
 *
 * 2. **Le numéro de commande.** Il vaut `COUNT(*) + 1`, ce qui n'est pas
 *    atomique : deux commandes simultanées visent le même `SS-000N`. La
 *    contrainte unique `(tenant_id, order_number)` en refuse une, et le code
 *    rejoue toute la transaction — trois fois au plus. Ce mécanisme n'existe
 *    que face à une vraie contrainte : un P2002 simulé prouve qu'on sait
 *    l'attraper, pas qu'il se produit ni que le retry suffit.
 *
 * 3. **L'idempotence sur la réservation.** `reservation_id` est unique ; deux
 *    confirmations simultanées de la même réservation doivent rendre la même
 *    commande, pas deux.
 *
 * Nécessite DATABASE_URL.
 * Exécution : RUN_INTEGRATION_TESTS=true npx vitest run createOrderFromReservation.integration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("~/lib/logger", () => ({
  workerLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// L'envoi WhatsApp n'est pas le sujet : on ne veut ni réseau ni file d'attente.
// `vi.fn()` nu rend `undefined`, or le worker enchaîne `.catch()` sur le retour :
// le mock doit résoudre, sinon on teste un TypeError et non le worker.
vi.mock("~/server/messaging/outbox", () => ({
  writeToOutbox: vi.fn().mockResolvedValue(undefined),
}));

// Chaque test enchaîne des allers-retours vers une base distante ; le défaut
// de 5 s de Vitest est calibré pour des tests en mémoire.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const shouldRun =
  process.env.RUN_INTEGRATION_TESTS === "true" && !!process.env.DATABASE_URL;

describe.skipIf(!shouldRun)("createOrderFromReservation — base réelle", () => {
  let db: typeof import("~/server/db").db;
  let createOrderFromReservation: typeof import("./createOrderFromReservation").createOrderFromReservation;

  let tenantId: string;
  let liveSessionId: string;

  beforeAll(async () => {
    db = (await import("~/server/db")).db;
    createOrderFromReservation = (await import("./createOrderFromReservation"))
      .createOrderFromReservation;

    const tenant = await db.tenant.create({
      data: { name: "Test Tenant Order Concurrency" },
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
    await db.messageOut.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await db.order.deleteMany({ where: { tenantId } });
    await db.reservation.deleteMany({ where: { tenantId } });
    await db.liveItem.deleteMany({ where: { tenantId } });
  });

  /** Un article et une réservation prête à être confirmée. */
  async function readyReservation(availableQty = 5, quantity = 1) {
    const item = await db.liveItem.create({
      data: {
        tenantId,
        liveSessionId,
        code: `O${Math.floor(Math.random() * 1_000_000)}`,
        quantity: availableQty,
        availableQty,
        reservedQty: quantity,
      },
    });
    const reservation = await db.reservation.create({
      data: {
        tenantId,
        liveSessionId,
        liveItemId: item.id,
        clientPhone: "+2250701020304",
        quantity,
        status: "address_collected",
        address: "Cocody, Angré",
        correlationId: `corr-${Math.random().toString(36).slice(2)}`,
      },
    });
    return { itemId: item.id, reservationId: reservation.id };
  }

  it("crée la commande et décrémente le stock", async () => {
    const { itemId, reservationId } = await readyReservation(5);

    const result = await createOrderFromReservation(
      tenantId,
      reservationId,
      false,
      "+2250701020304",
      "corr-1",
    );

    expect(result.success).toBe(true);
    const item = await db.liveItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.availableQty).toBe(4);
    expect(item.reservedQty).toBe(0);

    const reservation = await db.reservation.findUniqueOrThrow({
      where: { id: reservationId },
    });
    expect(reservation.status).toBe("confirmed");
  });

  describe("numérotation", () => {
    it("numérote séquentiellement", async () => {
      const numbers: string[] = [];
      for (let i = 0; i < 3; i++) {
        const { reservationId } = await readyReservation();
        const r = await createOrderFromReservation(
          tenantId,
          reservationId,
          false,
          "+2250701020304",
          `corr-seq-${i}`,
        );
        if (r.success) numbers.push(r.order.orderNumber);
      }

      expect(numbers).toEqual(["SS-0001", "SS-0002", "SS-0003"]);
    });

    /**
     * `COUNT(*) + 1` n'est pas atomique. Cinq confirmations simultanées visent
     * le même numéro ; la contrainte unique en refuse quatre, et le code doit
     * rejouer. Ce qui compte n'est pas *comment* il y arrive, mais qu'aucune
     * vente ne se perde et qu'aucun numéro ne soit attribué deux fois — un
     * numéro en double, c'est deux commandes confondues en litige.
     */
    it("cinq commandes simultanées : cinq numéros, tous distincts", async () => {
      const reservations = await Promise.all(
        Array.from({ length: 5 }, () => readyReservation()),
      );

      const results = await Promise.all(
        reservations.map((r, i) =>
          createOrderFromReservation(
            tenantId,
            r.reservationId,
            false,
            "+2250701020304",
            `corr-conc-${i}`,
          ),
        ),
      );

      const created = results.filter((r) => r.success);
      expect(created).toHaveLength(5);

      const numbers = created.map((r) => (r.success ? r.order.orderNumber : ""));
      expect(new Set(numbers).size).toBe(5);

      const rows = await db.order.findMany({ where: { tenantId } });
      expect(rows).toHaveLength(5);
      expect(new Set(rows.map((o) => o.orderNumber)).size).toBe(5);
    });
  });

  describe("idempotence", () => {
    it("rend la commande existante au lieu d'en créer une seconde", async () => {
      const { reservationId } = await readyReservation();

      const first = await createOrderFromReservation(
        tenantId,
        reservationId,
        false,
        "+2250701020304",
        "corr-a",
      );
      const second = await createOrderFromReservation(
        tenantId,
        reservationId,
        false,
        "+2250701020304",
        "corr-b",
      );

      expect(first.success && second.success).toBe(true);
      expect(first.success && second.success && first.order.id).toBe(
        second.success ? second.order.id : null,
      );
      expect(await db.order.count({ where: { tenantId } })).toBe(1);
    });

    /**
     * Deux « OUI » de la même cliente à la même seconde. Le contrôle
     * d'idempotence précède la transaction : les deux le passent. C'est la
     * contrainte unique sur `reservation_id` qui tranche — et le stock ne doit
     * être décrémenté qu'une fois.
     */
    it("deux confirmations simultanées de la même réservation ne créent qu'une commande", async () => {
      const { itemId, reservationId } = await readyReservation(5, 1);

      const results = await Promise.all([
        createOrderFromReservation(tenantId, reservationId, false, "+2250701020304", "c1"),
        createOrderFromReservation(tenantId, reservationId, false, "+2250701020304", "c2"),
      ]);

      const succeeded = results.filter((r) => r.success);
      expect(succeeded.length).toBeGreaterThanOrEqual(1);
      expect(await db.order.count({ where: { tenantId } })).toBe(1);

      const item = await db.liveItem.findUniqueOrThrow({ where: { id: itemId } });
      expect(item.availableQty).toBe(4);
    });
  });

  describe("rollback", () => {
    /**
     * La garantie 1. On confirme deux fois la même réservation *après* avoir
     * ramené le stock à zéro : la confirmation échoue au milieu de la
     * transaction, et le stock doit rester exactement tel qu'avant l'appel.
     */
    it("laisse le stock intact quand la confirmation échoue", async () => {
      const { itemId, reservationId } = await readyReservation(1, 1);
      await db.liveItem.update({
        where: { id: itemId },
        data: { availableQty: 0, reservedQty: 0 },
      });

      const result = await createOrderFromReservation(
        tenantId,
        reservationId,
        false,
        "+2250701020304",
        "corr-rollback",
      );

      expect(result).toEqual({ success: false, reason: "confirm_failed" });

      const item = await db.liveItem.findUniqueOrThrow({ where: { id: itemId } });
      expect(item.availableQty).toBe(0);
      expect(item.reservedQty).toBe(0);
      expect(await db.order.count({ where: { tenantId } })).toBe(0);

      // La réservation ne doit pas être passée en `confirmed` pour rien.
      const reservation = await db.reservation.findUniqueOrThrow({
        where: { id: reservationId },
      });
      expect(reservation.status).toBe("address_collected");
    });

    it("refuse une réservation qui n'a pas encore d'adresse", async () => {
      const { reservationId } = await readyReservation();
      await db.reservation.update({
        where: { id: reservationId },
        data: { status: "reserved" },
      });

      const result = await createOrderFromReservation(
        tenantId,
        reservationId,
        false,
        "+2250701020304",
        "corr-early",
      );

      expect(result).toEqual({ success: false, reason: "reservation_not_found" });
      expect(await db.order.count({ where: { tenantId } })).toBe(0);
    });
  });

  it("pose l'échéance d'acompte quand la boutique l'exige", async () => {
    const { reservationId } = await readyReservation();

    const result = await createOrderFromReservation(
      tenantId,
      reservationId,
      true,
      "+2250701020304",
      "corr-deposit",
    );

    expect(result.success).toBe(true);
    const order = await db.order.findUniqueOrThrow({ where: { reservationId } });
    expect(order.status).toBe("confirmed_pending_deposit");
    expect(order.depositStatus).toBe("deposit_pending");
    expect(order.depositExpiresAt).toBeInstanceOf(Date);
  });
});
