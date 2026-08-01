import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

const mockUserFindUnique = vi.hoisted(() => vi.fn());
const mockUserUpdate = vi.hoisted(() => vi.fn());
const mockTransaction = vi.hoisted(() => vi.fn());
const mockHash = vi.hoisted(() => vi.fn());
const mockCompare = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    user: { findUnique: mockUserFindUnique, update: mockUserUpdate },
    $transaction: mockTransaction,
  },
}));
vi.mock("bcrypt", () => ({
  hash: mockHash,
  compare: mockCompare,
}));

describe("auth.signup mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHash.mockResolvedValue("hashed-password");
  });

  it("creates tenant and user when email is free", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const mockTenant = { id: "tenant-1", name: "Ma boutique" };
    const mockUser = {
      id: "user-1",
      email: "vendeur@example.com",
      tenantId: "tenant-1",
    };
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        tenant: {
          create: vi.fn().mockResolvedValue(mockTenant),
        },
        user: {
          create: vi.fn().mockResolvedValue(mockUser),
        },
      };
      return fn(mockTx);
    });

    const ctx = await createTRPCContext({
      headers: new Headers(),
      session: null,
    });
    const caller = createCaller(ctx);

    const result = await caller.auth.signup({
      email: "vendeur@example.com",
      password: "password123",
      tenantName: "Ma boutique",
      name: "Jean",
    });

    expect(result).toEqual({
      userId: "user-1",
      tenantId: "tenant-1",
      email: "vendeur@example.com",
    });
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { email: "vendeur@example.com" },
    });
    expect(mockTransaction).toHaveBeenCalled();
    expect(mockHash).toHaveBeenCalledWith("password123", 10);
  });

  it("throws CONFLICT when email already exists", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "existing",
      email: "vendeur@example.com",
    });

    const ctx = await createTRPCContext({
      headers: new Headers(),
      session: null,
    });
    const caller = createCaller(ctx);

    await expect(
      caller.auth.signup({
        email: "vendeur@example.com",
        password: "password123",
        tenantName: "Ma boutique",
      }),
    ).rejects.toThrow(TRPCError);

    await expect(
      caller.auth.signup({
        email: "vendeur@example.com",
        password: "password123",
        tenantName: "Ma boutique",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Un compte existe déjà avec cet email.",
    });

    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

/**
 * ── CHANGER SON MOT DE PASSE ────────────────────────────────────────────────
 *
 * Aucun moyen n'existait de le faire : un mot de passe divulgué ne pouvait pas
 * être remplacé. Le mécanisme de révocation (`tokenVersion`) citait pourtant ce
 * cas comme sa raison d'être, sans que rien ne l'incrémente hors des mouvements
 * d'équipe.
 */
describe("auth.changePassword mutation", () => {
  const session = {
    user: {
      id: "user-1",
      email: "vendeur@example.com",
      tenantId: "tenant-1",
      role: "AGENT" as const,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockHash.mockResolvedValue("nouveau-hash");
  });

  async function callChangePassword(
    input: { currentPassword: string; newPassword: string },
    sessionOverride: unknown = session,
  ) {
    const ctx = await createTRPCContext({
      headers: new Headers(),
      session: sessionOverride as never,
    });
    return createCaller(ctx).auth.changePassword(input);
  }

  it("remplace le hash et invalide les sessions ouvertes", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      passwordHash: "ancien-hash",
    });
    mockCompare.mockResolvedValue(true);

    await expect(
      callChangePassword({
        currentPassword: "ancien-mot-de-passe",
        newPassword: "nouveau-mot-de-passe",
      }),
    ).resolves.toEqual({ ok: true });

    expect(mockHash).toHaveBeenCalledWith("nouveau-mot-de-passe", 10);
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        passwordHash: "nouveau-hash",
        // Le cœur de l'opération : sans cet incrément, les sessions ouvertes
        // ailleurs — celles qu'on cherche justement à couper — survivraient.
        tokenVersion: { increment: 1 },
      },
    });
  });

  /**
   * Une session ouverte ne suffit pas : sans cette vérification, un poste laissé
   * sans surveillance quelques minutes permettrait de s'approprier le compte.
   */
  it("refuse et n'écrit rien si le mot de passe actuel est faux", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      passwordHash: "ancien-hash",
    });
    mockCompare.mockResolvedValue(false);

    await expect(
      callChangePassword({
        currentPassword: "mauvais",
        newPassword: "nouveau-mot-de-passe",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("exige une session", async () => {
    await expect(
      callChangePassword(
        {
          currentPassword: "ancien-mot-de-passe",
          newPassword: "nouveau-mot-de-passe",
        },
        null,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  /**
   * `authedProcedure` et non `protectedProcedure` : le compte appartient à la
   * personne, pas à sa boutique. Un utilisateur OPS n'a pas de `tenantId`, et
   * quelqu'un qui vient d'être retiré d'une équipe n'en a plus — les deux
   * doivent pouvoir changer leur mot de passe.
   */
  it("fonctionne sans tenant (OPS, ou compte retiré d'une équipe)", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "user-ops",
      passwordHash: "ancien-hash",
    });
    mockCompare.mockResolvedValue(true);

    await expect(
      callChangePassword(
        {
          currentPassword: "ancien-mot-de-passe",
          newPassword: "nouveau-mot-de-passe",
        },
        {
          user: {
            id: "user-ops",
            email: "ops@snapsell.io",
            tenantId: null,
            role: "OPS",
          },
        },
      ),
    ).resolves.toEqual({ ok: true });
  });

  it("refuse un nouveau mot de passe identique à l'actuel", async () => {
    await expect(
      callChangePassword({
        currentPassword: "meme-mot-de-passe",
        newPassword: "meme-mot-de-passe",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockUserUpdate).not.toHaveBeenCalled();
  });
});
