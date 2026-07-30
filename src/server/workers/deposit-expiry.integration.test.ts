/**
 * Test d'intégration : expiration des acomptes, garde conditionnelle réelle.
 *
 * Le worker annule les commandes dont le délai d'acompte est dépassé. Sa seule
 * protection est un `updateMany` conditionnel :
 *
 *   WHERE id = … AND deposit_status = 'deposit_pending'
 *
 * La condition est *dans* l'écriture, pas avant. C'est ce qui rend l'opération
 * sûre quand une vendeuse valide une preuve à la seconde où le worker passe :
 * l'écriture ne touche aucune ligne, et la cliente ne reçoit pas d'annulation
 * pour une commande qui vient d'être acceptée.
 *
 * Le test unitaire voisin (`deposit-expiry.test.ts`) vérifie que le code *lit*
 * correctement `count: 0`. Il ne peut pas vérifier que Postgres produit
 * réellement ce `0` — c'est l'objet de ce fichier, qui fait vraiment courir les
 * deux opérations en parallèle.
 *
 * Nécessite DATABASE_URL.
 * Exécution : RUN_INTEGRATION_TESTS=true npx vitest run deposit-expiry.integration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("~/lib/logger", () => ({
  workerLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockWriteToOutbox = vi.hoisted(() => vi.fn());
vi.mock("~/server/messaging/outbox", () => ({ writeToOutbox: mockWriteToOutbox }));

const shouldRun =
  process.env.RUN_INTEGRATION_TESTS === "true" && !!process.env.DATABASE_URL;

describe.skipIf(!shouldRun)("runDepositExpiryJob — base réelle", () => {
  let db: typeof import("~/server/db").db;
  let runDepositExpiryJob: typeof import("./deposit-expiry").runDepositExpiryJob;

  let tenantId: string;
  let liveSessionId: string;
  let liveItemId: string;
  let orderSeq = 0;

  beforeAll(async () => {
    db = (await import("~/server/db")).db;
    runDepositExpiryJob = (await import("./deposit-expiry")).runDepositExpiryJob;

    const tenant = await db.tenant.create({
      data: { name: "Test Tenant Deposit Expiry" },
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
        code: "D1",
        quantity: 50,
        availableQty: 50,
        reservedQty: 0,
      },
    });
    liveItemId = item.id;
  });

  afterAll(async () => {
    if (!db || !tenantId) return;
    await db.eventLog.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockWriteToOutbox.mockResolvedValue(undefined);
    await db.order.deleteMany({ where: { tenantId } });
    await db.reservation.deleteMany({ where: { tenantId } });
  });

  /** Une commande en attente d'acompte, dont l'échéance est déjà passée. */
  async function pendingOrder(overrides: Record<string, unknown> = {}) {
    const reservation = await db.reservation.create({
      data: {
        tenantId,
        liveSessionId,
        liveItemId,
        clientPhone: "+2250701020304",
        quantity: 1,
        status: "confirmed",
        correlationId: `corr-${(orderSeq += 1)}`,
      },
    });
    return db.order.create({
      data: {
        tenantId,
        reservationId: reservation.id,
        orderNumber: `SS-${String(orderSeq).padStart(4, "0")}`,
        status: "confirmed_pending_deposit",
        depositStatus: "deposit_pending",
        depositExpiresAt: new Date(Date.now() - 60_000),
        ...overrides,
      },
    });
  }

  it("annule la commande échue et prévient la cliente", async () => {
    const order = await pendingOrder();

    const result = await runDepositExpiryJob();

    expect(result.expiredCount).toBe(1);
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe("cancelled");
    expect(after.depositStatus).toBe("deposit_rejected");
    expect(mockWriteToOutbox).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, to: "+2250701020304" }),
    );
  });

  it("laisse tranquille une commande dont le délai court encore", async () => {
    const order = await pendingOrder({
      depositExpiresAt: new Date(Date.now() + 600_000),
    });

    const result = await runDepositExpiryJob();

    expect(result.expiredCount).toBe(0);
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe("confirmed_pending_deposit");
    expect(mockWriteToOutbox).not.toHaveBeenCalled();
  });

  /**
   * Le scénario qui justifie le garde. La preuve est validée pendant que le
   * worker tourne : la commande ne doit ni être annulée, ni déclencher le
   * message d'annulation. C'est la seule vérification qui distingue « le code
   * lit bien count: 0 » de « Postgres refuse bien l'écriture ».
   */
  it("n'annule pas une commande dont la preuve vient d'être validée", async () => {
    const order = await pendingOrder();

    const [result] = await Promise.all([
      runDepositExpiryJob(),
      db.order.update({
        where: { id: order.id },
        data: { status: "confirmed", depositStatus: "deposit_approved" },
      }),
    ]);

    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });

    // L'ordre d'arrivée décide qui gagne, mais les deux issues doivent rester
    // cohérentes : jamais une annulation par-dessus une preuve acceptée.
    if (after.depositStatus === "deposit_approved") {
      expect(after.status).toBe("confirmed");
      expect(result.expiredCount).toBe(0);
      expect(mockWriteToOutbox).not.toHaveBeenCalled();
    } else {
      expect(after.status).toBe("cancelled");
      expect(result.expiredCount).toBe(1);
    }
  });

  /** Deux passes du cron qui se chevauchent ne doivent pas annuler deux fois. */
  it("deux passes simultanées n'annulent et ne notifient qu'une fois", async () => {
    await pendingOrder();

    const [a, b] = await Promise.all([runDepositExpiryJob(), runDepositExpiryJob()]);

    expect(a.expiredCount + b.expiredCount).toBe(1);
    expect(mockWriteToOutbox).toHaveBeenCalledTimes(1);
  });

  it("traite tout un lot de commandes échues", async () => {
    await Promise.all([pendingOrder(), pendingOrder(), pendingOrder()]);

    const result = await runDepositExpiryJob();

    expect(result.expiredCount).toBe(3);
    expect(
      await db.order.count({ where: { tenantId, status: "cancelled" } }),
    ).toBe(3);
  });

  /** L'annulation doit rester traçable : c'est le système qui a décidé, pas une personne. */
  it("trace l'annulation au journal d'activité", async () => {
    const order = await pendingOrder();

    await runDepositExpiryJob();

    const events = await db.eventLog.findMany({
      where: { tenantId, entityId: order.id, eventType: "deposit_rejected" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.actorType).toBe("system");
  });
});
