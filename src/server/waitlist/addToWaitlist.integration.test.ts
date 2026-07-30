/**
 * Test d'intégration : file d'attente sous concurrence réelle.
 *
 * `addToWaitlist` n'avait aucun test, d'aucune sorte — 121 lignes qui décident
 * de l'ordre dans lequel les clientes récupèrent une pièce libérée. Deux choses
 * s'y jouent, et aucune n'est vérifiable avec un mock :
 *
 * 1. **La position.** Elle vaut `MAX(position) + 1`, calculé sous un
 *    `SELECT … FOR UPDATE` sur l'article. Sans ce verrou, deux inscriptions
 *    simultanées lisent le même maximum et obtiennent la même position — deux
 *    clientes « premières », et la promotion en libère deux pour une pièce.
 *
 * 2. **L'idempotence.** Le contrôle « est-elle déjà en file ? » a lieu *avant*
 *    la transaction. C'est un TOCTOU assumé : deux messages simultanés de la
 *    même cliente passent tous deux le contrôle. Le rattrapage repose sur un
 *    index unique **partiel** (`waitlist_live_unique`, `waitlist_catalogue_unique`),
 *    que Prisma ne sait pas exprimer et qui n'apparaît donc pas dans
 *    `schema.prisma` — il n'existe que dans la migration. Une base montée au
 *    `db push` depuis le schéma ne l'aurait pas, et le doublon passerait.
 *    Ce fichier est le seul endroit où cette hypothèse est vérifiée.
 *
 * Nécessite DATABASE_URL.
 * Exécution : RUN_INTEGRATION_TESTS=true npx vitest run addToWaitlist.integration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("~/lib/logger", () => ({
  workerLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Chaque test enchaîne des allers-retours vers une base distante ; le défaut
// de 5 s de Vitest est calibré pour des tests en mémoire.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const shouldRun =
  process.env.RUN_INTEGRATION_TESTS === "true" && !!process.env.DATABASE_URL;

describe.skipIf(!shouldRun)("addToWaitlist — concurrence réelle", () => {
  let db: typeof import("~/server/db").db;
  let addToWaitlist: typeof import("./addToWaitlist").addToWaitlist;

  let tenantId: string;
  let liveSessionId: string;
  let liveItemId: string;
  let catalogueItemId: string;

  beforeAll(async () => {
    db = (await import("~/server/db")).db;
    addToWaitlist = (await import("./addToWaitlist")).addToWaitlist;

    const tenant = await db.tenant.create({
      data: { name: "Test Tenant Waitlist Concurrency" },
    });
    tenantId = tenant.id;

    const session = await db.liveSession.create({
      data: { tenantId, lastActivityAt: new Date() },
    });
    liveSessionId = session.id;

    const item = await db.liveItem.create({
      data: {
        tenantId,
        liveSessionId,
        code: "W1",
        quantity: 1,
        availableQty: 0,
        reservedQty: 0,
      },
    });
    liveItemId = item.id;

    const catItem = await db.catalogueItem.create({
      data: { tenantId, code: "WC1", quantity: 1, availableQty: 0, reservedQty: 0 },
    });
    catalogueItemId = catItem.id;
  });

  afterAll(async () => {
    if (!db || !tenantId) return;
    await db.tenant.delete({ where: { id: tenantId } });
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await db.waitlist.deleteMany({ where: { tenantId } });
  });

  function addLive(phone: string) {
    return addToWaitlist(tenantId, liveSessionId, liveItemId, phone, `corr-${phone}`);
  }

  describe("positions", () => {
    it("attribue les positions dans l'ordre d'arrivée", async () => {
      expect(await addLive("+2250700000001")).toMatchObject({ ok: true, position: 1 });
      expect(await addLive("+2250700000002")).toMatchObject({ ok: true, position: 2 });
      expect(await addLive("+2250700000003")).toMatchObject({ ok: true, position: 3 });
    });

    /**
     * Le cœur du fichier. Sans le verrou sur l'article, les huit transactions
     * lisent le même `MAX(position)` et s'attribuent toutes la position 1 : la
     * file n'a plus d'ordre, et une pièce libérée est promise à plusieurs
     * personnes à la fois.
     */
    it("huit inscriptions simultanées obtiennent huit positions distinctes", async () => {
      const phones = Array.from({ length: 8 }, (_, i) => `+22507111000${i}`);

      const results = await Promise.all(phones.map(addLive));

      expect(results.every((r) => r.ok)).toBe(true);
      const positions = results.map((r) => (r.ok ? r.position : -1)).sort((a, b) => a - b);
      expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

      const rows = await db.waitlist.findMany({ where: { tenantId, liveItemId } });
      expect(new Set(rows.map((r) => r.position)).size).toBe(8);
    });

    /** Les files de deux articles différents sont indépendantes. */
    it("numérote chaque article séparément", async () => {
      const second = await db.liveItem.create({
        data: {
          tenantId,
          liveSessionId,
          code: "W2",
          quantity: 1,
          availableQty: 0,
          reservedQty: 0,
        },
      });

      await addLive("+2250700000001");
      await addLive("+2250700000002");
      const other = await addToWaitlist(
        tenantId,
        liveSessionId,
        second.id,
        "+2250700000003",
        "corr-other",
      );

      expect(other).toMatchObject({ ok: true, position: 1 });

      await db.liveItem.delete({ where: { id: second.id } });
    });
  });

  describe("idempotence", () => {
    it("ne réinscrit pas une cliente déjà en file", async () => {
      const first = await addLive("+2250700000009");
      const again = await addLive("+2250700000009");

      expect(first).toMatchObject({ ok: true, position: 1 });
      expect(again).toMatchObject({ ok: true, position: 1, alreadyInWaitlist: true });

      const count = await db.waitlist.count({ where: { tenantId, liveItemId } });
      expect(count).toBe(1);
    });

    /**
     * Le TOCTOU. Le contrôle d'existence précède la transaction : quatre messages
     * simultanés de la même cliente le passent tous. Seul l'index unique partiel
     * empêche les quatre lignes — et il n'existe que dans la migration, pas dans
     * `schema.prisma`. Si ce test échoue sur une base donnée, c'est que l'index
     * manque sur cette base, pas que le code a changé.
     */
    it("quatre messages simultanés de la même cliente ne créent qu'une ligne", async () => {
      const phone = "+2250700000042";

      const results = await Promise.all(Array.from({ length: 4 }, () => addLive(phone)));

      expect(results.every((r) => r.ok)).toBe(true);
      const positions = results.map((r) => (r.ok ? r.position : -1));
      expect(new Set(positions).size).toBe(1);

      const count = await db.waitlist.count({
        where: { tenantId, liveItemId, clientPhone: phone },
      });
      expect(count).toBe(1);
    });

    it("garde les files live et catalogue séparées pour la même cliente", async () => {
      const phone = "+2250700000077";

      await addLive(phone);
      const cat = await addToWaitlist(tenantId, null, null, phone, "corr-cat", {
        table: "catalogue_items",
        catalogueItemId,
      });

      expect(cat).toMatchObject({ ok: true, position: 1 });
      expect(await db.waitlist.count({ where: { tenantId, clientPhone: phone } })).toBe(2);
    });
  });

  describe("article introuvable", () => {
    it("refuse de mettre en file sur un article d'une autre boutique", async () => {
      const other = await db.tenant.create({ data: { name: "Autre boutique" } });

      const result = await addToWaitlist(
        other.id,
        liveSessionId,
        liveItemId,
        "+2250700000099",
        "corr-cross",
      );

      expect(result).toEqual({ ok: false, reason: "not_found" });

      await db.tenant.delete({ where: { id: other.id } });
    });
  });
});
