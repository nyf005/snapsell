import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
const publish = vi.hoisted(() => vi.fn());
const send = vi.hoisted(() => vi.fn());
vi.mock("@upstash/qstash", () => ({ Client: class { publishJSON = publish; } }));
vi.mock("~/env", () => ({ env: {
  NODE_ENV: "production", QSTASH_TOKEN: "test", NEXT_PUBLIC_APP_URL: "https://example.test",
} }));
vi.mock("~/server/messaging/service", () => ({ getProviderForTenant: async () => ({ send }) }));
vi.mock("~/lib/logger", () => ({ workerLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe.skipIf(process.env.RUN_INTEGRATION_TESTS !== "true")("outbox recovery with PostgreSQL", () => {
  let db: typeof import("~/server/db").db;
  let write: typeof import("./outbox").writeToOutbox;
  let publishOne: typeof import("./outbox-publisher").publishOutboxMessage;
  let recover: typeof import("~/server/workers/outbox-recovery").runOutboxRecovery;
  let processMessage: typeof import("~/server/workers/outbox-sender").processOutboundMessage;
  let tenantId: string;
  beforeAll(async () => {
    db = (await import("~/server/db")).db;
    write = (await import("./outbox")).writeToOutbox;
    publishOne = (await import("./outbox-publisher")).publishOutboxMessage;
    recover = (await import("~/server/workers/outbox-recovery")).runOutboxRecovery;
    processMessage = (await import("~/server/workers/outbox-sender")).processOutboundMessage;
    tenantId = (await db.tenant.create({ data: { assistantEnabled: true, name: "Outbox test", metaPhoneNumberId: "outbox-reliability-test", metaAccessToken: "test" } })).id;
    await db.messageIn.create({ data: { tenantId, from: "+2250701020304", providerMessageId: "reliability-inbound", correlationId: "reliability-inbound", body: "Bonjour", providerSentAt: new Date() } });
  });
  afterAll(async () => {
    if (!tenantId) return;
    await db.messageIn.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
  });
  beforeEach(async () => {
    vi.clearAllMocks();
    publish.mockResolvedValue({ messageId: "qstash-test" });
    send.mockResolvedValue({ success: true, providerMessageId: "wamid.test" });
    await db.messageOut.deleteMany({ where: { tenantId } });
  });
  const message = () => ({ tenantId, to: "+2250701020304", body: "Confirmation", correlationId: "reliability" });
  it("récupère un échec de publication sans perdre ni recréer le message", async () => {
    publish.mockRejectedValueOnce(new Error("QStash unavailable"));
    const saved = await write(message());
    expect((await db.messageOut.findUniqueOrThrow({ where: { id: saved.id } })).publishedAt).toBeNull();
    await db.messageOut.update({ where: { id: saved.id }, data: { createdAt: new Date(Date.now() - 60000) } });
    await recover();
    expect((await db.messageOut.findUniqueOrThrow({ where: { id: saved.id } })).publishedAt).not.toBeNull();
    expect(publish).toHaveBeenCalledTimes(2);
    await write(message());
    expect(publish).toHaveBeenCalledTimes(2);
    expect(await db.messageOut.count({ where: { tenantId } })).toBe(1);
  });
  it("un seul publieur gagne quand cinq reprises arrivent ensemble", async () => {
    const saved = await db.messageOut.create({ data: { ...message(), status: "pending" } });
    await Promise.all(Array.from({ length: 5 }, () => publishOne(saved.id)));
    expect(publish).toHaveBeenCalledOnce();
  });
  it("reprend un bail de publication expiré après arrêt du process", async () => {
    const saved = await db.messageOut.create({ data: { ...message(), status: "pending", publishLeaseUntil: new Date(Date.now() - 1000) } });
    expect(await publishOne(saved.id)).toBe(true);
  });
  it("ne renvoie pas le message lors de callbacks concurrents ou d'un rejeu après succès", async () => {
    const saved = await db.messageOut.create({ data: { ...message(), status: "pending", purpose: "order_confirmation" } });
    const results = await Promise.all(Array.from({ length: 5 }, () => processMessage(saved)));
    expect(results.some((result) => result.success)).toBe(true);
    expect(send).toHaveBeenCalledOnce();
    await processMessage(saved);
    expect(send).toHaveBeenCalledOnce();
    const delivered = await db.messageOut.findUniqueOrThrow({ where: { id: saved.id } });
    expect(delivered.status).toBe("sent");
    expect(delivered.sentAt).not.toBeNull();
    expect(delivered.sendLeaseUntil).toBeNull();
  });
  it("libère le verrou après échec Meta pour permettre le retry", async () => {
    const saved = await db.messageOut.create({ data: { ...message(), status: "pending" } });
    send.mockResolvedValueOnce({ success: false, error: "Meta unavailable" });
    expect((await processMessage(saved)).success).toBe(false);
    const failed = await db.messageOut.findUniqueOrThrow({ where: { id: saved.id } });
    expect(failed.sendLeaseUntil).toBeNull();
    expect((await processMessage(failed)).success).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
