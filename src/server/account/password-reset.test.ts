import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/server/db", () => ({
  db: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    user: { findUnique: vi.fn(), update: vi.fn() },
    passwordResetToken: { findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("bcrypt", () => ({ hash: vi.fn().mockResolvedValue("hashed") }));

import { db } from "~/server/db";
import {
  hashPasswordResetToken,
  issuePasswordResetToken,
  resetPasswordWithToken,
} from "./password-reset";

describe("issuePasswordResetToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stocke seulement le hash et neutralise les jetons précédents", async () => {
    vi.mocked(db.$transaction).mockImplementation(async (fn: unknown) => (fn as (tx: typeof db) => Promise<unknown>)(db));
    const { token, expiresAt } = await issuePasswordResetToken("user-1");

    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 25 * 60 * 1000);
    expect(db.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    const createArgs = vi.mocked(db.passwordResetToken.create).mock.calls[0]![0];
    expect(createArgs.data.tokenHash).toBe(hashPasswordResetToken(token));
    expect(JSON.stringify(createArgs)).not.toContain(token);
  });
});

describe("resetPasswordWithToken", () => {
  const token = "b".repeat(64);
  const future = new Date(Date.now() + 10 * 60 * 1000);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.$transaction).mockImplementation(async (fn: unknown) =>
      (fn as (tx: typeof db) => Promise<unknown>)(db),
    );
  });

  it("refuse un jeton inconnu", async () => {
    vi.mocked(db.passwordResetToken.findUnique).mockResolvedValue(null);
    await expect(resetPasswordWithToken(token, "motdepasse")).resolves.toEqual({ ok: false, reason: "invalid" });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("refuse un jeton déjà consommé", async () => {
    vi.mocked(db.passwordResetToken.findUnique).mockResolvedValue({
      id: "t1", userId: "u1", expiresAt: future, usedAt: new Date(),
    } as never);
    await expect(resetPasswordWithToken(token, "motdepasse")).resolves.toEqual({ ok: false, reason: "used" });
  });

  it("refuse un jeton expiré", async () => {
    vi.mocked(db.passwordResetToken.findUnique).mockResolvedValue({
      id: "t1", userId: "u1", expiresAt: new Date(Date.now() - 1000), usedAt: null,
    } as never);
    await expect(resetPasswordWithToken(token, "motdepasse")).resolves.toEqual({ ok: false, reason: "expired" });
  });

  it("remplace le mot de passe et coupe les sessions ouvertes", async () => {
    vi.mocked(db.passwordResetToken.findUnique).mockResolvedValue({
      id: "t1", userId: "u1", expiresAt: future, usedAt: null,
    } as never);
    vi.mocked(db.passwordResetToken.updateMany).mockResolvedValue({ count: 1 });

    await expect(resetPasswordWithToken(token, "motdepasse")).resolves.toEqual({ ok: true, userId: "u1" });
    expect(db.passwordResetToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashPasswordResetToken(token) } }),
    );
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { passwordHash: "hashed", tokenVersion: { increment: 1 } },
    });
  });

  it("ne change rien si un autre appel a consommé le jeton entre-temps", async () => {
    vi.mocked(db.passwordResetToken.findUnique).mockResolvedValue({
      id: "t1", userId: "u1", expiresAt: future, usedAt: null,
    } as never);
    vi.mocked(db.passwordResetToken.updateMany).mockResolvedValue({ count: 0 });

    await expect(resetPasswordWithToken(token, "motdepasse")).resolves.toEqual({ ok: false, reason: "used" });
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
