import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  workerLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const rateLimit = vi.hoisted(() => ({
  request: vi.fn().mockResolvedValue(true),
  attempt: vi.fn().mockResolvedValue(true),
}));
vi.mock("~/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/rate-limit")>()),
  checkPasswordResetRequestRateLimit: (...args: unknown[]) => rateLimit.request(...args),
  checkPasswordResetAttemptRateLimit: (...args: unknown[]) => rateLimit.attempt(...args),
}));

const account = vi.hoisted(() => ({
  findUser: vi.fn(),
  issue: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("~/server/account/password-reset", () => ({
  findUserForPasswordReset: (...args: unknown[]) => account.findUser(...args),
  issuePasswordResetToken: (...args: unknown[]) => account.issue(...args),
  resetPasswordWithToken: (...args: unknown[]) => account.reset(...args),
}));

const email = vi.hoisted(() => ({
  canSend: vi.fn().mockReturnValue(true),
  send: vi.fn().mockResolvedValue({ ok: true, id: "email_1" }),
}));
vi.mock("~/server/account/password-reset-email", () => ({
  canSendPasswordResetEmail: () => email.canSend(),
  sendPasswordResetEmail: (...args: unknown[]) => email.send(...args),
}));

const TOKEN = "c".repeat(64);

async function anonymousCaller() {
  return createCaller(
    await createTRPCContext({ headers: new Headers({ "x-forwarded-for": "203.0.113.9" }), session: null }),
  );
}

const queue = vi.hoisted(() => ({ enqueue: vi.fn().mockResolvedValue(undefined) }));
vi.mock("~/server/account/password-reset-delivery", () => ({ enqueuePasswordReset: queue.enqueue }));

describe("auth.requestPasswordReset", () => {
  beforeEach(() => { vi.clearAllMocks(); email.canSend.mockReturnValue(true); rateLimit.request.mockResolvedValue(true); queue.enqueue.mockResolvedValue(undefined); });
  it("répond identiquement et ne recherche aucun compte avant publication", async () => {
    const caller = await anonymousCaller();
    expect(await caller.auth.requestPasswordReset({ email: "unknown@example.com" })).toEqual(await caller.auth.requestPasswordReset({ email: "known@example.com" }));
    expect(account.findUser).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
    expect(queue.enqueue).toHaveBeenCalledTimes(2);
  });
  it("refuse uniformément si la file est indisponible", async () => {
    queue.enqueue.mockRejectedValue(new Error("offline"));
    const caller = await anonymousCaller();
    for (const email of ["known@example.com", "unknown@example.com"]) {
      await expect(caller.auth.requestPasswordReset({email})).rejects.toMatchObject({code:"INTERNAL_SERVER_ERROR"});
    }
    expect(account.findUser).not.toHaveBeenCalled();
  });
  it("vérifie la configuration et le frein avant de publier", async () => {
    const caller = await anonymousCaller();
    email.canSend.mockReturnValue(false);
    await expect(caller.auth.requestPasswordReset({email:"a@b.co"})).rejects.toMatchObject({code:"PRECONDITION_FAILED"});
    email.canSend.mockReturnValue(true); rateLimit.request.mockResolvedValue(false);
    await expect(caller.auth.requestPasswordReset({email:"a@b.co"})).rejects.toMatchObject({code:"TOO_MANY_REQUESTS"});
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});

describe("auth.resetPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimit.attempt.mockResolvedValue(true);
  });

  it("traduit chaque refus du service en message pour la personne", async () => {
    const caller = await anonymousCaller();
    for (const reason of ["invalid", "expired", "used"] as const) {
      account.reset.mockResolvedValueOnce({ ok: false, reason });
      await expect(caller.auth.resetPassword({ token: TOKEN, password: "motdepasse" })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
  });

  it("confirme quand le service accepte", async () => {
    account.reset.mockResolvedValue({ ok: true, userId: "u1" });
    const caller = await anonymousCaller();
    await expect(caller.auth.resetPassword({ token: TOKEN, password: "motdepasse" })).resolves.toEqual({ ok: true });
    expect(account.reset).toHaveBeenCalledWith(TOKEN, "motdepasse");
  });

  it("freine les tentatives par IP", async () => {
    rateLimit.attempt.mockResolvedValue(false);
    const caller = await anonymousCaller();
    await expect(caller.auth.resetPassword({ token: TOKEN, password: "motdepasse" })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(account.reset).not.toHaveBeenCalled();
  });
});

describe("auth.passwordResetAvailability", () => {
  it("reflète la configuration email", async () => {
    email.canSend.mockReturnValue(false);
    const caller = await anonymousCaller();
    await expect(caller.auth.passwordResetAvailability()).resolves.toEqual({ emailEnabled: false });
  });
});
