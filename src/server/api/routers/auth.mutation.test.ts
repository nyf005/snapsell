import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

const mockUserFindUnique = vi.hoisted(() => vi.fn());
const mockTransaction = vi.hoisted(() => vi.fn());
const mockHash = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    user: { findUnique: mockUserFindUnique },
    $transaction: mockTransaction,
  },
}));
vi.mock("bcrypt", () => ({
  hash: mockHash,
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
