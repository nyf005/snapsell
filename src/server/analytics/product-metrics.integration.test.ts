import { beforeAll, afterAll, describe, expect, it } from "vitest";

describe.skipIf(process.env.RUN_INTEGRATION_TESTS !== "true")("product metrics", () => {
  let db: typeof import("~/server/db").db;
  let metrics: typeof import("./product-metrics").getProductMetrics;
  let tenantId: string;
  let otherId: string;
  const now = new Date("2026-09-11T12:00:00Z");
  beforeAll(async () => {
    db = (await import("~/server/db")).db;
    metrics = (await import("./product-metrics")).getProductMetrics;
    tenantId = (await db.tenant.create({ data: { name: "Metrics test", createdAt: new Date(now.getTime() - 3600000) } })).id;
    otherId = (await db.tenant.create({ data: { name: "Other metrics test" } })).id;
  });
  afterAll(async () => {
    if (tenantId) await db.tenant.delete({ where: { id: tenantId } });
    if (otherId) await db.tenant.delete({ where: { id: otherId } });
  });
  it("ne présente pas l'absence de données comme zéro", async () => {
    const result = await metrics(tenantId, now);
    expect(result.conversionPercent).toBeNull();
    expect(result.handoffPercent).toBeNull();
    expect(result.firstConfirmationSeconds).toBeNull();
    expect(result.preparationSeconds).toBeNull();
  });
  it("mesure les transmissions une fois par conversation et isole les boutiques", async () => {
    await db.conversationMetric.createMany({ data: [
      { id: "metric-test-a", tenantId, startedAt: now, handedOff: true },
      { id: "metric-test-b", tenantId, startedAt: now },
      { id: "metric-test-other", tenantId: otherId, startedAt: now, handedOff: true },
    ] });
    await db.messageOut.createMany({ data: [
      { tenantId, to: "+2250701020304", correlationId: "sent-test", status: "sent", purpose: "order_confirmation", sentAt: new Date(now.getTime() - 1800000) },
      { tenantId, to: "+2250701020304", correlationId: "pending-test", status: "pending", purpose: "order_confirmation" },
    ] });
    const result = await metrics(tenantId, now);
    expect(result.conversations).toBe(2);
    expect(result.handoffPercent).toBe(50);
    expect(result.firstConfirmationSeconds).toBe(1800);
  });
  it("enregistre l'ouverture et la transmission sans conserver le téléphone dans les métriques", async () => {
    const { checkAndConsumeCredit } = await import("~/server/credits/service");
    const { setHandedOff } = await import("~/server/conversation/conversationState");
    await checkAndConsumeCredit(tenantId, "+2250701020304");
    const window = await db.conversationWindow.findFirstOrThrow({ where: { tenantId } });
    await setHandedOff(tenantId, "+2250701020304", true);
    await setHandedOff(tenantId, "+2250701020304", true);
    expect(await db.conversationMetric.findUnique({ where: { id: window.id } })).toMatchObject({ tenantId, handedOff: true });
  });
  it("calcule la conversion et la médiane à partir des commandes du live", async () => {
    const session = await db.liveSession.create({ data: { tenantId, status: "closed", lastActivityAt: now } });
    const item = await db.liveItem.create({ data: { tenantId, liveSessionId: session.id, code: "M1", quantity: 3, availableQty: 3 } });
    const closedAt = new Date(now.getTime() - 600000);
    await db.eventLog.create({ data: { tenantId, eventType: "live_session_closed", entityType: "live_session", entityId: session.id, correlationId: "metrics-close", actorType: "system", payload: {}, createdAt: closedAt } });
    for (let index = 0; index < 3; index++) {
      const reservation = await db.reservation.create({ data: { tenantId, liveSessionId: session.id, liveItemId: item.id, clientPhone: `+225070100000${index}`, correlationId: `metrics-res-${index}`, createdAt: closedAt } });
      if (index < 2) {
        const order = await db.order.create({ data: { tenantId, reservationId: reservation.id, orderNumber: `METRIC-${index}`, status: "in_delivery", depositStatus: "no_deposit" } });
        await db.eventLog.create({ data: { tenantId, eventType: "order.status_changed", entityType: "order", entityId: order.id, correlationId: `metrics-ship-${index}`, actorType: "seller", payload: { from: "preparing", to: "in_delivery" }, createdAt: new Date(closedAt.getTime() + (index ? 180000 : 60000)) } });
      }
    }
    const result = await metrics(tenantId, now);
    expect(result.reservations).toBe(3);
    expect(result.converted).toBe(2);
    expect(result.conversionPercent).toBe(67);
    expect(result.preparationSeconds).toBe(120);
    expect(result.preparationSamples).toBe(2);
  });

});
