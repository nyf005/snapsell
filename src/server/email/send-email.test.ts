import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({ env: {} as Record<string, string | undefined> }));
vi.mock("~/env", () => envMock);
vi.mock("~/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { isEmailConfigured, sendEmail } from "./send-email";

describe("sendEmail", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    envMock.env = { RESEND_API_KEY: "re_test", EMAIL_FROM: "SnapSell <no-reply@snapsell.app>" };
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("n’appelle pas le fournisseur quand la configuration est absente", async () => {
    envMock.env = {};
    expect(isEmailConfigured()).toBe(false);
    const result = await sendEmail({ to: "a@b.c", subject: "s", text: "t" });
    expect(result).toEqual({ ok: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("poste le message sur l’API Resend avec la clé en Bearer", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));
    const result = await sendEmail({ to: "a@b.c", subject: "Sujet", text: "Corps" });
    expect(result).toEqual({ ok: true, id: "email_1" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer re_test" });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      from: "SnapSell <no-reply@snapsell.app>",
      to: ["a@b.c"],
      subject: "Sujet",
      text: "Corps",
    });
  });

  it("signale un refus du fournisseur sans lever", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 422 }));
    await expect(sendEmail({ to: "a@b.c", subject: "s", text: "t" })).resolves.toEqual({
      ok: false,
      reason: "provider_error",
    });
  });

  it("signale un fournisseur injoignable sans lever", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    await expect(sendEmail({ to: "a@b.c", subject: "s", text: "t" })).resolves.toEqual({
      ok: false,
      reason: "provider_error",
    });
  });
});
