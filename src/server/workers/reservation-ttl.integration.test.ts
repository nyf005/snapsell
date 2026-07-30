/**
 * Test d'intégration : expiration des réservations et promotion de la file.
 *
 * Ce worker est celui qui fait tourner le stock : il libère les réservations
 * échues et donne la place au premier en file. Sa boucle est protégée par deux
 * mécanismes que le mock ne peut pas exercer :
 *
 * 1. **Un `UPDATE … WHERE status IN (…) AND expires_at <= now RETURNING`.**
 *    Le filtre est dans l'écriture, pas avant. Si la cliente confirme sa
 *    commande à la seconde où le worker passe, l'`UPDATE` ne touche aucune
 *    ligne et le worker doit s'abstenir — sinon on annule une vente conclue et
 *    on rend au stock une pièce déjà partie. Un mock qui renvoie `count: 0`
 *    prouve qu'on sait lire le compteur, pas que Postgres a bien arbitré.
 *
 * 2. **La promotion dans la même transaction.** Expirer et promouvoir doivent
 *    aller ensemble : une expiration sans promotion laisse la file bloquée
 *    devant du stock libre, une promotion sans expiration en promet deux fois.
 *
 * Nécessite DATABASE_URL.
 * Exécution : RUN_INTEGRATION_TESTS=true npx vitest run reservation-ttl.integration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("~/lib/logger", () => ({
  workerLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
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

describe.skipIf(!shouldRun)("runReservationTtlJob — base réelle", () => {
  let db: typeof import("~/server/db").db;
  let runReservationTtlJob: typeof import("./reservation-ttl").runReservationTtlJob;
  let runReservationReminderJob: typeof import("./reservation-ttl").runReservationReminderJob;

  let tenantId: string;
  let liveSessionId: string;

  beforeAll(async () => {
    db = (await import("~/server/db")).db;
    const mod = await import("./reservation-ttl");
    runReservationTtlJob = mod.runReservationTtlJob;
    runReservationReminderJob = mod.runReservationReminderJob;

    const tenant = await db.tenant.create({
      data: { name: "Test Tenant Reservation TTL" },
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
    await db.waitlist.deleteMany({ where: { tenantId } });
    await db.order.deleteMany({ where: { tenantId } });
    await db.reservation.deleteMany({ where: { tenantId } });
    await db.liveItem.deleteMany({ where: { tenantId } });
  });

  async function item(availableQty = 1, reservedQty = 1) {
    const created = await db.liveItem.create({
      data: {
        tenantId,
        liveSessionId,
        code: `T${Math.floor(Math.random() * 1_000_000)}`,
        quantity: availableQty,
        availableQty,
        reservedQty,
      },
    });
    return created.id;
  }

  async function reservation(
    liveItemId: string,
    overrides: Record<string, unknown> = {},
  ) {
    return db.reservation.create({
      data: {
        tenantId,
        liveSessionId,
        liveItemId,
        clientPhone: "+2250701020304",
        quantity: 1,
        status: "reserved",
        expiresAt: new Date(Date.now() - 60_000),
        correlationId: `corr-${Math.random().toString(36).slice(2)}`,
        ...overrides,
      },
    });
  }

  it("expire une réservation échue et rend l'unité au stock", async () => {
    const itemId = await item(1, 1);
    const res = await reservation(itemId);

    const result = await runReservationTtlJob();

    expect(result.expiredCount).toBe(1);
    const after = await db.reservation.findUniqueOrThrow({ where: { id: res.id } });
    expect(after.status).toBe("expired");
    const stock = await db.liveItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(stock.reservedQty).toBe(0);
  });

  it("laisse tranquille une réservation dont le délai court encore", async () => {
    const itemId = await item(1, 1);
    const res = await reservation(itemId, {
      expiresAt: new Date(Date.now() + 600_000),
    });

    const result = await runReservationTtlJob();

    expect(result.expiredCount).toBe(0);
    const after = await db.reservation.findUniqueOrThrow({ where: { id: res.id } });
    expect(after.status).toBe("reserved");
    expect(
      (await db.liveItem.findUniqueOrThrow({ where: { id: itemId } })).reservedQty,
    ).toBe(1);
  });

  /**
   * Le garde conditionnel. La cliente a confirmé entre la lecture et l'écriture :
   * le statut n'est plus actif, l'`UPDATE` ne touche rien, et le worker doit
   * s'abstenir — ni annulation, ni unité rendue au stock pour une pièce vendue.
   */
  it("n'annule pas une réservation confirmée entre-temps", async () => {
    const itemId = await item(1, 1);
    const res = await reservation(itemId, { status: "confirmed" });

    const result = await runReservationTtlJob();

    expect(result.expiredCount).toBe(0);
    const after = await db.reservation.findUniqueOrThrow({ where: { id: res.id } });
    expect(after.status).toBe("confirmed");
    expect(
      (await db.liveItem.findUniqueOrThrow({ where: { id: itemId } })).reservedQty,
    ).toBe(1);
  });

  /**
   * Deux passes rapprochées du worker — ce qui arrive dès qu'un cron se
   * chevauche avec lui-même. Le stock ne doit être rendu qu'une fois, sinon
   * `reserved_qty` part en négatif et le calcul du disponible est faussé pour
   * toute la suite du live.
   */
  it("deux passes simultanées ne rendent l'unité qu'une seule fois", async () => {
    const itemId = await item(1, 1);
    await reservation(itemId);

    const [a, b] = await Promise.all([
      runReservationTtlJob(),
      runReservationTtlJob(),
    ]);

    expect(a.expiredCount + b.expiredCount).toBe(1);
    const stock = await db.liveItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(stock.reservedQty).toBe(0);
    expect(stock.reservedQty).toBeGreaterThanOrEqual(0);
  });

  describe("promotion de la file", () => {
    it("promeut le premier en file et le retire de la file", async () => {
      const itemId = await item(1, 1);
      await reservation(itemId);
      await db.waitlist.create({
        data: {
          tenantId,
          liveSessionId,
          liveItemId: itemId,
          clientPhone: "+2250709090909",
          position: 1,
          correlationId: "corr-wl-1",
        },
      });

      const result = await runReservationTtlJob();

      expect(result.expiredCount).toBe(1);
      expect(result.promotedCount).toBe(1);

      expect(await db.waitlist.count({ where: { tenantId } })).toBe(0);
      const promoted = await db.reservation.findFirst({
        where: { tenantId, clientPhone: "+2250709090909" },
      });
      expect(promoted).not.toBeNull();
    });

    /** Le second en file doit rester en file, pas être promu en même temps. */
    it("ne promeut qu'une personne par unité libérée", async () => {
      const itemId = await item(1, 1);
      await reservation(itemId);
      await db.waitlist.createMany({
        data: [
          {
            tenantId,
            liveSessionId,
            liveItemId: itemId,
            clientPhone: "+2250709090901",
            position: 1,
            correlationId: "corr-wl-1",
          },
          {
            tenantId,
            liveSessionId,
            liveItemId: itemId,
            clientPhone: "+2250709090902",
            position: 2,
            correlationId: "corr-wl-2",
          },
        ],
      });

      const result = await runReservationTtlJob();

      expect(result.promotedCount).toBe(1);
      const remaining = await db.waitlist.findMany({ where: { tenantId } });
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.clientPhone).toBe("+2250709090902");
    });

    it("expire sans promouvoir quand la file est vide", async () => {
      const itemId = await item(1, 1);
      await reservation(itemId);

      const result = await runReservationTtlJob();

      expect(result.expiredCount).toBe(1);
      expect(result.promotedCount).toBe(0);
    });
  });

  describe("rappel T-2", () => {
    it("n'envoie le rappel qu'une seule fois", async () => {
      const itemId = await item(1, 1);
      // La fenêtre de rappel est now+2min → now+3min : 2,5 min tombe dedans.
      await reservation(itemId, {
        expiresAt: new Date(Date.now() + 150_000),
      });

      const first = await runReservationReminderJob();
      const second = await runReservationReminderJob();

      expect(first.reminderSentCount).toBe(1);
      expect(second.reminderSentCount).toBe(0);
    });

    /** Deux passes concurrentes du cron ne doivent pas doubler le rappel. */
    it("ne double pas le rappel sous deux passes simultanées", async () => {
      const itemId = await item(1, 1);
      // La fenêtre de rappel est now+2min → now+3min : 2,5 min tombe dedans.
      await reservation(itemId, {
        expiresAt: new Date(Date.now() + 150_000),
      });

      const [a, b] = await Promise.all([
        runReservationReminderJob(),
        runReservationReminderJob(),
      ]);

      expect(a.reminderSentCount + b.reminderSentCount).toBe(1);
    });
  });
});
