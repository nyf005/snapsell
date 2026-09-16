import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Keep database writes and uniqueness constraints real; prevent network delivery only.
vi.mock("~/server/messaging/outbox-publisher", () => ({ publishOutboxMessage: vi.fn().mockResolvedValue(undefined) }));
vi.mock("~/server/messaging/ai-service", async (importOriginal) => ({ ...await importOriginal<typeof import("~/server/messaging/ai-service")>(), analyzeInboundIntent: vi.fn().mockResolvedValue(null), extractAddressComponents: vi.fn().mockResolvedValue({ city: "Abidjan", commune: "Cocody" }) }));
vi.mock("~/server/payment/paystack", () => ({ verifyWebhookSignature: () => true }));
vi.mock("~/server/subscription/usage", () => ({ checkProofsQuota: async () => ({ allowed: true, currentUsage: 0, quota: 100 }) }));
vi.mock("~/lib/logger", () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }), workerLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });
describe.skipIf(process.env.RUN_INTEGRATION_TESTS !== "true")("audit corrections — real PostgreSQL and outbox", () => {
  let db: typeof import("~/server/db").db;
  let confirm: typeof import("./createOrderFromReservation").createOrderFromReservation;
  let cancel: typeof import("~/server/reservation/cancel").cancelActiveReservations;
  let status: typeof import("./service").updateOrderStatus;
  let expire: typeof import("~/server/workers/reservation-ttl").runReservationTtlJob;
  let remind: typeof import("~/server/workers/reservation-ttl").runReservationReminderJob;
  let expireDeposits: typeof import("~/server/workers/deposit-expiry").runDepositExpiryJob;
  let write: typeof import("~/server/messaging/outbox").writeToOutbox;
  let proof: typeof import("~/server/proof/createPaymentProof").createPaymentProof;
  let tenantId: string;
  const phone = "+2250701020304";
  beforeAll(async () => {
    db = (await import("~/server/db")).db;
    confirm = (await import("./createOrderFromReservation")).createOrderFromReservation;
    cancel = (await import("~/server/reservation/cancel")).cancelActiveReservations;
    status = (await import("./service")).updateOrderStatus;
    ({ runReservationTtlJob: expire, runReservationReminderJob: remind } = await import("~/server/workers/reservation-ttl"));
    expireDeposits = (await import("~/server/workers/deposit-expiry")).runDepositExpiryJob;
    write = (await import("~/server/messaging/outbox")).writeToOutbox;
    proof = (await import("~/server/proof/createPaymentProof")).createPaymentProof;
  });
  beforeEach(async () => {
    if (tenantId) await db.tenant.delete({ where: { id: tenantId } });
    tenantId = (await db.tenant.create({ data: { name: "Audit regression", maxProofsPerMonth: 100 } })).id;
  });
  afterAll(async () => { if (tenantId) await db.tenant.delete({ where: { id: tenantId } }); });
  async function ready(quantity = 1, variant = false, code = "A12") {
    const item = await db.catalogueItem.create({ data: { tenantId, code, amount: 500000, quantity, availableQty: quantity, reservedQty: quantity, createdInLive: true } });
    const v = variant ? await db.itemVariant.create({ data: { tenantId, catalogueItemId: item.id, label: "Rouge", values: { couleur: "Rouge" }, quantity, availableQty: quantity, reservedQty: quantity } }) : null;
    const reservation = await db.reservation.create({ data: { tenantId, catalogueItemId: item.id, variantId: v?.id, clientPhone: phone, quantity, status: "address_collected", correlationId: `inbound:${code}`, address: "Cocody", expiresAt: new Date(Date.now() + 600000) } });
    return { item, reservation, variant: v };
  }
  it("last live unit preserves order and evidence; catalogue deletion is rejected by the database", async () => {
    const { item, reservation } = await ready();
    expect((await confirm(tenantId, reservation.id, true, phone, "confirm")).success).toBe(true);
    const order = await db.order.findUniqueOrThrow({ where: { reservationId: reservation.id } });
    const evidence = await proof(tenantId, order.id, { textPayload: "Transaction 123456" }, "proof");
    expect(evidence).not.toBeNull();
    await expect(db.catalogueItem.delete({ where: { id: item.id } })).rejects.toMatchObject({ code: "P2003" });
    expect(await db.order.count({ where: { id: order.id } })).toBe(1);
    expect(await db.paymentProof.count({ where: { orderId: order.id } })).toBe(1);
    expect(await db.catalogueItem.findUnique({ where: { id: item.id } })).toMatchObject({ quantity: 0, availableQty: 0, reservedQty: 0 });
  });
  it("quantity three: reminder and expiration survive the original outbox message and release variant plus parent", async () => {
    const { item, reservation, variant } = await ready(3, true);
    await write({ tenantId, to: phone, body: "Réservation créée", correlationId: reservation.correlationId });
    await db.reservation.update({ where: { id: reservation.id }, data: { expiresAt: new Date(Date.now() + 150000) } });
    await remind();
    await remind();
    await db.reservation.update({ where: { id: reservation.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expire();
    await expire();
    expect(await db.messageOut.count({ where: { tenantId, to: phone } })).toBe(3);
    expect(await db.catalogueItem.findUnique({ where: { id: item.id } })).toMatchObject({ availableQty: 3, reservedQty: 0 });
    expect(await db.itemVariant.findUnique({ where: { id: variant!.id } })).toMatchObject({ availableQty: 3, reservedQty: 0 });
  });
  it("concurrent reservation cancellation releases every unit exactly once", async () => {
    const { item, variant } = await ready(3, true);
    const results = await Promise.all([cancel(tenantId, phone), cancel(tenantId, phone)]);
    expect(results.reduce((a, b) => a + b, 0)).toBe(1);
    expect(await db.catalogueItem.findUnique({ where: { id: item.id } })).toMatchObject({ availableQty: 3, reservedQty: 0 });
    expect(await db.itemVariant.findUnique({ where: { id: variant!.id } })).toMatchObject({ availableQty: 3, reservedQty: 0 });
  });
  it("concurrent order cancellation restores quantity and variant only once", async () => {
    const { item, reservation, variant } = await ready(3, true);
    const order = await confirm(tenantId, reservation.id, false, phone, "confirm");
    if (!order.success) throw new Error("confirmation failed");
    const opts = { tenantId, orderId: order.order.id, newStatus: "cancelled" as const };
    const results = await Promise.all([status(opts), status(opts)]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect(await db.catalogueItem.findUnique({ where: { id: item.id } })).toMatchObject({ quantity: 3, availableQty: 3, reservedQty: 0 });
    expect(await db.itemVariant.findUnique({ where: { id: variant!.id } })).toMatchObject({ quantity: 3, availableQty: 3, reservedQty: 0 });
  });
  it("expired reservation cannot consume another customer's held units", async () => {
    const { item, reservation } = await ready(3);
    await db.reservation.update({ where: { id: reservation.id }, data: { expiresAt: new Date(Date.now() - 1) } });
    expect((await confirm(tenantId, reservation.id, false, phone, "late")).success).toBe(false);
    expect(await db.order.count({ where: { tenantId } })).toBe(0);
    expect(await db.catalogueItem.findUnique({ where: { id: item.id } })).toMatchObject({ availableQty: 3, reservedQty: 3 });
  });
  it("simultaneous confirmation replays return the same order and consume stock once", async () => {
    const { item, reservation } = await ready(3);
    const results = await Promise.all([confirm(tenantId, reservation.id, false, phone, "yes1"), confirm(tenantId, reservation.id, false, phone, "yes2")]);
    expect(results.every(r => r.success)).toBe(true);
    expect(await db.order.count({ where: { tenantId } })).toBe(1);
    expect(await db.catalogueItem.findUnique({ where: { id: item.id } })).toMatchObject({ quantity: 0, availableQty: 0, reservedQty: 0 });
  });
  it("pending receipt prevents automatic cancellation; receipt replay creates one proof", async () => {
    const { reservation } = await ready();
    const result = await confirm(tenantId, reservation.id, true, phone, "confirm");
    if (!result.success) throw new Error("confirmation failed");
    await proof(tenantId, result.order.id, { textPayload: "Transaction 123456" }, "proof");
    await proof(tenantId, result.order.id, { textPayload: "Transaction 123456" }, "proof");
    await db.order.update({ where: { id: result.order.id }, data: { depositExpiresAt: new Date(Date.now() - 1000) } });
    await expireDeposits();
    expect(await db.order.findUnique({ where: { id: result.order.id } })).toMatchObject({ status: "confirmed_pending_deposit" });
    expect(await db.paymentProof.count({ where: { orderId: result.order.id } })).toBe(1);
  });
  it("expired deposit restores stock and writes its own notification once", async () => {
    const { item, reservation } = await ready(2);
    const result = await confirm(tenantId, reservation.id, true, phone, "confirm");
    if (!result.success) throw new Error("confirmation failed");
    await db.order.update({ where: { id: result.order.id }, data: { depositExpiresAt: new Date(Date.now() - 1000) } });
    await expireDeposits();
    await expireDeposits();
    expect(await db.catalogueItem.findUnique({ where: { id: item.id } })).toMatchObject({ quantity: 2, availableQty: 2, reservedQty: 0 });
    expect(await db.messageOut.count({ where: { tenantId, to: phone } })).toBe(2);
  });
  it("one address covers all reserved items", async () => {
    const first = await ready(1, false, "A1");
    const second = await ready(2, false, "B2");
    await db.reservation.updateMany({ where: { tenantId }, data: { status: "reserved", address: null } });
    const { collectAddress } = await import("~/server/reservation/service");
    const result = await collectAddress(tenantId, phone, "Cocody, Abidjan");
    expect(result.success && result.reservation.items?.length).toBe(2);
    expect(await db.reservation.count({ where: { tenantId, status: "address_collected", address: "Cocody, Abidjan" } })).toBe(2);
    for (const r of [first.reservation, second.reservation]) expect((await confirm(tenantId, r.id, false, phone, "cart-confirm")).success).toBe(true);
    expect(await db.order.count({ where: { tenantId } })).toBe(2);
  });
  it("Paystack rolls back the payment when credit update fails and applies retries once", async () => {
    const { POST } = await import("~/app/api/webhooks/paystack/route");
    await db.tenant.update({ where: { id: tenantId }, data: { creditsBonus: 2147483647 } });
    const request = () => new Request("https://example.test/api/webhooks/paystack", { method: "POST", body: JSON.stringify({ event: "charge.success", data: { reference: `audit:${tenantId}`, amount: 10000, metadata: { tenantId, type: "credits_topup", creditsAmount: 10 } } }) });
    expect((await POST(request())).status).toBe(500);
    expect(await db.subscriptionPayment.count({ where: { tenantId } })).toBe(0);
    await db.tenant.update({ where: { id: tenantId }, data: { creditsBonus: 0 } });
    const responses = await Promise.all([POST(request()), POST(request())]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    expect(await db.subscriptionPayment.count({ where: { tenantId, status: "success" } })).toBe(1);
    expect(await db.tenant.findUnique({ where: { id: tenantId } })).toMatchObject({ creditsBonus: 10 });
  });
  it("an inactive live session is closed before its replacement is created", async () => {
    await db.liveSession.create({ data: { tenantId, lastActivityAt: new Date(0) } });
    const { getOrCreateCurrentSession } = await import("~/server/live-session/service");
    expect((await getOrCreateCurrentSession(tenantId)).created).toBe(true);
    expect(await db.liveSession.count({ where: { tenantId, status: "active" } })).toBe(1);
  });
  it("a rejected receipt can be replaced without losing the order", async () => {
    const { reservation } = await ready();
    const result = await confirm(tenantId, reservation.id, true, phone, "confirm");
    if (!result.success) throw new Error("confirmation failed");
    const original = await proof(tenantId, result.order.id, { textPayload: "Transaction 123456" }, "proof1");
    const { proofsRouter } = await import("~/server/api/routers/proofs");
    const caller = proofsRouter.createCaller({ db, session: { user: { id: "owner", role: "OWNER", tenantId } }, headers: new Headers() } as never);
    await caller.reject({ proofId: original!.id });
    const updated = await db.order.findUniqueOrThrow({ where: { id: result.order.id } });
    expect(updated.depositStatus).toBe("deposit_pending");
    expect(updated.depositExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(await proof(tenantId, result.order.id, { textPayload: "Transaction 789012" }, "proof2")).not.toBeNull();
    expect(await db.paymentProof.count({ where: { orderId: result.order.id } })).toBe(2);
  });
  it("variant replacement refuses direct holds and existing orders", async () => {
    const { canReplaceVariants } = await import("~/server/catalogue/guardVariantReplacement");
    const { item, reservation } = await ready();
    expect(await db.$transaction(tx => canReplaceVariants(tx, tenantId, item.id))).toBe(false);
    expect((await confirm(tenantId, reservation.id, false, phone, "confirm")).success).toBe(true);
    expect(await db.$transaction(tx => canReplaceVariants(tx, tenantId, item.id))).toBe(false);
  });
  it("native two-item basket → common address → one confirmation creates both orders", async () => {
    await db.tenant.update({ where: { id: tenantId }, data: { assistantEnabled: true, creditsBalance: 70, subscriptionPlan: "free" } });
    await db.catalogueItem.createMany({ data: ["A1", "B2"].map(code => ({ tenantId, code, amount: 500000, quantity: 5, availableQty: 5 })) });
    const { processWebhookJob } = await import("~/server/workers/webhook-processor");
    const run = (body: string, correlationId: string, extra = {}) => processWebhookJob({ id: correlationId, data: { tenantId, from: phone, body, providerMessageId: correlationId, correlationId, ...extra } } as never);
    await run("", "cart", { orderPayload: { catalogId: "catalog", items: ["A1", "B2"].map(productRetailerId => ({ productRetailerId, quantity: 2, itemPrice: 5000, currency: "XOF" })) } });
    expect(await db.reservation.count({ where: { tenantId, status: "reserved" } })).toBe(2);
    await run("Abidjan, Cocody, rue 12", "address");
    expect(await db.reservation.count({ where: { tenantId, status: "address_collected" } })).toBe(2);
    await run("", "confirmation", { interactiveReplyId: "confirm_order" });
    expect(await db.order.count({ where: { tenantId, status: "confirmed" } })).toBe(2);
    const ack = await db.messageOut.findFirstOrThrow({ where: { tenantId, correlationId: "confirmation" } });
    expect(ack.body).toContain("SS-0001");
    expect(ack.body).toContain("SS-0002");
    const stocks = await db.catalogueItem.findMany({ where: { tenantId } });
    expect(stocks.every(item => item.quantity === 3 && item.availableQty === 3 && item.reservedQty === 0)).toBe(true);
  });

});
