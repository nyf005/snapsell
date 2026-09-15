import { beforeEach, describe, expect, it, vi } from "vitest";
import { ORDER_STATUS_TEMPLATE_BODY } from "~/lib/whatsapp-template";
const mocks = vi.hoisted(() => ({ inbound: vi.fn(), consent: vi.fn(), tenant: vi.fn(), fetch: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {
  messageIn: { findFirst: mocks.inbound }, messagingConsent: { findUnique: mocks.consent },
  tenant: { findUnique: mocks.tenant },
} }));
vi.mock("~/lib/crypto", () => ({ decrypt: (s: string) => s }));
import { decideSendingPolicy, isServiceWindowOpen } from "./sending-policy";
const context = { kind: "order_status", orderNumber: "CMD-42", status: "delivered" };
const template = { name: "suivi", language: "fr", category: "UTILITY", status: "APPROVED", components: [{ type: "BODY", text: ORDER_STATUS_TEMPLATE_BODY }] };
const tenant = { hasNotificationsOutside24h: true, metaWabaId: "waba", metaAccessToken: "token", whatsappTemplateName: "suivi", whatsappTemplateLanguage: "fr" };

describe("WhatsApp sending policy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.inbound.mockResolvedValue(null);
    mocks.consent.mockResolvedValue({ id: "consent" });
    mocks.tenant.mockResolvedValue(tenant);
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [template] }) });
  });

  it.each([[-1, false], [0, true], [86399999, true], [86400000, false], [86400001, false]])(
    "last incoming message age %i milliseconds opens window: %s", async (age, open) => {
      const now = new Date("2026-09-14T12:00:00Z");
      mocks.inbound.mockResolvedValue({ providerSentAt: new Date(now.getTime() - age) });
      expect(await isServiceWindowOpen("t", "+2250701020304", now)).toBe(open);
      expect(mocks.inbound).toHaveBeenCalledWith(expect.objectContaining({
        where: { tenantId: "t", from: "+2250701020304", providerSentAt: { not: null, lte: now } },
        orderBy: { providerSentAt: "desc" },
      }));
    },
  );
  it("does not use recent receipt time to reopen a legacy or delayed message", async () => {
    mocks.inbound.mockResolvedValue({ providerSentAt: null, createdAt: new Date() });
    expect(await isServiceWindowOpen("t", "p")).toBe(false);
  });
  it("rechecks the window on each attempt and never sends ordinary text after expiry", async () => {
    mocks.inbound.mockResolvedValueOnce({ providerSentAt: new Date() });
    expect(await decideSendingPolicy("t", "p", undefined)).toEqual({ mode: "freeform" });
    expect(await decideSendingPolicy("t", "p", undefined)).toEqual({ mode: "blocked", reason: "whatsapp_window_closed" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("requires client consent even with a configured approved template", async () => {
    mocks.consent.mockResolvedValue(null);
    expect(await decideSendingPolicy("t", "p", context)).toEqual({ mode: "blocked", reason: "whatsapp_consent_missing" });
    expect(mocks.consent).toHaveBeenCalledWith({ where: { tenantId_phone_scope: { tenantId: "t", phone: "p", scope: "order_updates" } } });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("binds order number and status to an approved utility template", async () => {
    expect(await decideSendingPolicy("t", "p", context)).toEqual({ mode: "template", name: "suivi", language: "fr", parameters: ["CMD-42", "livrée"] });
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("/waba/message_templates?name=suivi"), expect.objectContaining({ headers: { Authorization: "Bearer token" } }));
  });
  it.each([
    { status: "PAUSED" }, { category: "MARKETING" }, { language: "en" },
    { name: "other" }, { components: [] },
    { components: [{ type: "BODY", text: "Promotion {{1}} {{2}}" }] },
  ])("rejects incompatible or no longer approved templates: %j", async override => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [{ ...template, ...override }] }) });
    expect(await decideSendingPolicy("t", "p", context)).toEqual({ mode: "blocked", reason: "whatsapp_template_incompatible" });
  });
  it("fails closed on Meta verification errors", async () => {
    mocks.fetch.mockResolvedValue({ ok: false });
    await expect(decideSendingPolicy("t", "p", context)).rejects.toThrow("could not be verified");
  });
  it("requires configuration and the paid-plan entitlement outside 24h", async () => {
    mocks.tenant.mockResolvedValueOnce({ ...tenant, whatsappTemplateName: null });
    expect(await decideSendingPolicy("t", "p", context)).toMatchObject({ reason: "whatsapp_template_missing" });
    mocks.tenant.mockResolvedValueOnce({ ...tenant, hasNotificationsOutside24h: false });
    expect(await decideSendingPolicy("t", "p", context)).toMatchObject({ reason: "whatsapp_template_plan_required" });
  });
  it("blocks a queued product card without attested consent, even inside 24h", async () => {
    mocks.inbound.mockResolvedValue({ providerSentAt: new Date() });
    expect(await decideSendingPolicy("t", "p", null, true)).toMatchObject({ reason: "whatsapp_product_consent_missing" });
    expect(await decideSendingPolicy("t", "p", { kind: "requested_product", consentConfirmedBy: "seller", consentConfirmedAt: new Date().toISOString() }, true)).toEqual({ mode: "freeform" });
  });
});
