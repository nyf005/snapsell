import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), upload: vi.fn(), create: vi.fn(), reply: vi.fn() }));
vi.mock("~/server/db", () => ({ db: { order: { findMany: mocks.findMany } } }));
vi.mock("~/server/media/uploadProofMedia", () => ({ uploadProofMedia: mocks.upload }));
vi.mock("~/server/proof/createPaymentProof", () => ({ createPaymentProof: mocks.create }));
vi.mock("~/server/messaging/outbox", () => ({ writeToOutbox: mocks.reply }));
vi.mock("~/lib/logger", () => ({ workerLogger: { error: vi.fn() } }));
import { handlePendingPayment, hasPaymentReference } from "./payment-proof";
const input = { tenantId: "tenant", phone: "+2250102030405", body: "", mediaUrl: "image", correlationId: "message" };
describe("Rattachement et accusé de réception des preuves", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.findMany.mockResolvedValue([{ id: "one", orderNumber: "SS-1042" }]); mocks.upload.mockResolvedValue("stored-key"); mocks.create.mockResolvedValue({ id: "proof" }); });
  it.each(["Je peux payer demain ?", "j’ai payé", "SS-1042", "A123456"])("ne prend pas %s pour une référence", body => expect(hasPaymentReference(body)).toBe(false));
  it("accepte une référence explicite", () => expect(hasPaymentReference("SS-1042 référence TX12345678")).toBe(true));
  it.each(["upload", "create", "null"])("ne confirme pas un échec %s", async failure => {
    if (failure === "upload") mocks.upload.mockRejectedValue(new Error("offline"));
    if (failure === "create") mocks.create.mockRejectedValue(new Error("offline"));
    if (failure === "null") mocks.create.mockResolvedValue(null);
    await handlePendingPayment(input);
    expect(mocks.reply).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining("pas pu enregistrer") }));
    if (failure === "upload") expect(mocks.create).not.toHaveBeenCalled();
  });
  it("confirme seulement un justificatif enregistré", async () => {
    await handlePendingPayment(input);
    expect(mocks.create).toHaveBeenCalledWith("tenant", "one", { mediaStorageKey: "stored-key" }, "message");
    expect(mocks.reply).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining("SS-1042") }));
  });
  it("demande une commande sans enregistrer quand plusieurs sont possibles", async () => {
    mocks.findMany.mockResolvedValue([{ id: "one", orderNumber: "SS-1042" }, { id: "two", orderNumber: "SS-1043" }]);
    await handlePendingPayment(input);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.reply).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining("Pour quelle commande") }));
  });
  it("vérifie une référence explicite dans le périmètre du client et de la boutique", async () => {
    await handlePendingPayment({ ...input, body: "SS-1042" });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "tenant", orderNumber: "SS-1042", reservation: { clientPhone: input.phone } }) }));
  });
});
