import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  workerLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const account = vi.hoisted(() => ({ findUser: vi.fn(), issue: vi.fn() }));
vi.mock("~/server/account/password-reset", () => ({
  findUserForPasswordReset: (...args: unknown[]) => account.findUser(...args),
  issuePasswordResetToken: (...args: unknown[]) => account.issue(...args),
}));

const TOKEN = "d".repeat(64);

const opsSession = {
  user: { id: "clxops1234567890123456789", email: "ops@snapsell.com", tenantId: null, role: "OPS" },
} as const;
const ownerSession = {
  user: { id: "clxuser123456789012345678", email: "owner@b.co", tenantId: "clx1234567890123456789012", role: "OWNER" },
} as const;

async function callerFor(session: typeof opsSession | typeof ownerSession) {
  return createCaller(
    await createTRPCContext({ headers: new Headers(), session: session as never }),
  );
}

describe("ops.accounts.createPasswordResetLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    account.issue.mockResolvedValue({ token: TOKEN, expiresAt: new Date("2026-09-16T12:30:00Z") });
  });

  it("est réservé au support", async () => {
    const caller = await callerFor(ownerSession);
    await expect(caller.ops.accounts.createPasswordResetLink({ email: "a@b.co" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(account.findUser).not.toHaveBeenCalled();
  });

  it("renvoie un chemin portant le jeton pour un compte de boutique", async () => {
    account.findUser.mockResolvedValue({ id: "u1", email: "a@b.co", passwordHash: "h", tenantId: "t1" });
    const caller = await callerFor(opsSession);
    await expect(caller.ops.accounts.createPasswordResetLink({ email: "A@b.co" })).resolves.toEqual({
      email: "a@b.co",
      path: `/reinitialiser-mot-de-passe?token=${TOKEN}`,
      expiresAt: new Date("2026-09-16T12:30:00Z"),
    });
    expect(account.findUser).toHaveBeenCalledWith("a@b.co");
  });

  it("refuse un compte inconnu ou sans mot de passe", async () => {
    account.findUser.mockResolvedValue(null);
    const caller = await callerFor(opsSession);
    await expect(caller.ops.accounts.createPasswordResetLink({ email: "x@b.co" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(account.issue).not.toHaveBeenCalled();
  });

  it("ne réinitialise jamais un compte support depuis la console", async () => {
    account.findUser.mockResolvedValue({ id: "u2", email: "autre@snapsell.com", passwordHash: "h", tenantId: null });
    const caller = await callerFor(opsSession);
    await expect(caller.ops.accounts.createPasswordResetLink({ email: "autre@snapsell.com" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(account.issue).not.toHaveBeenCalled();
  });
});
