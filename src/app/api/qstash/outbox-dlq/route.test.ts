import { beforeEach, expect, it, vi } from "vitest";
const verify = vi.hoisted(() => vi.fn());
const find = vi.hoisted(() => vi.fn());
const upsert = vi.hoisted(() => vi.fn());
vi.mock("~/server/qstash/config", () => ({ isQStashMisconfiguredForHttpRoute: () => false, createQStashReceiver: () => ({ verify }) }));
vi.mock("~/server/db", () => ({ db: { messageOut: { findUnique: find }, deadLetterJob: { upsert } } }));
import { POST } from "./route";
function request(data: unknown) { return new Request("https://example.test/api/qstash/outbox-dlq", { method: "POST", body: JSON.stringify(data), headers: { "upstash-signature": "test" } }); }
beforeEach(() => { vi.clearAllMocks(); verify.mockResolvedValue(true); find.mockResolvedValue({ id: "msg-test", tenantId: "tenant-test", status: "failed", attempts: 6, correlationId: "test" }); upsert.mockResolvedValue({}); });
it("décode le vrai format du callback et déduplique les incidents", async () => {
  const data = { sourceBody: Buffer.from(JSON.stringify({ messageOutId: "msg-test" })).toString("base64"), status: 503 };
  expect((await POST(request(data))).status).toBe(200);
  expect((await POST(request(data))).status).toBe(200);
  expect(upsert.mock.calls[0]?.[0].where.id).toBe(upsert.mock.calls[1]?.[0].where.id);
  expect(upsert.mock.calls[0]?.[0].create.payload.messageOutId).toBe("msg-test");
});
it("rejette une signature invalide avant de lire le message", async () => {
  verify.mockResolvedValue(false);
  expect((await POST(request({}))).status).toBe(401);
  expect(find).not.toHaveBeenCalled();
});
it("rejette les données source invalides", async () => {
  expect((await POST(request({ sourceBody: "invalid" }))).status).toBe(400);
});
it("ignore un échec tardif après envoi réussi", async () => {
  find.mockResolvedValue({ id: "msg-test", status: "sent" });
  expect((await POST(request({ sourceBody: Buffer.from('{"messageOutId":"msg-test"}').toString("base64") }))).status).toBe(200);
  expect(upsert).not.toHaveBeenCalled();
});
