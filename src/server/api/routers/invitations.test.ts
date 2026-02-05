import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

const mockInvitationFindFirst = vi.hoisted(() => vi.fn());
const mockInvitationFindMany = vi.hoisted(() => vi.fn());
const mockInvitationCreate = vi.hoisted(() => vi.fn());
const mockInvitationUpdate = vi.hoisted(() => vi.fn());
const mockUserFindUnique = vi.hoisted(() => vi.fn());
const mockUserCreate = vi.hoisted(() => vi.fn());
const mockTransaction = vi.hoisted(() => vi.fn());
const mockHash = vi.hoisted(() => vi.fn());
const mockCheckRateLimit = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    invitation: {
      findFirst: mockInvitationFindFirst,
      findMany: mockInvitationFindMany,
      create: mockInvitationCreate,
      update: mockInvitationUpdate,
    },
    user: {
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
    },
    $transaction: mockTransaction,
  },
}));

vi.mock("bcrypt", () => ({
  hash: mockHash,
}));

vi.mock("~/lib/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
}));

describe("invitations router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHash.mockResolvedValue("hashed-password");
    mockCheckRateLimit.mockReturnValue(true);
  });

  describe("createInvitation", () => {
    const mockSession = {
      user: {
        id: "user-1",
        email: "manager@example.com",
        tenantId: "tenant-1",
        role: "MANAGER",
      },
    };

    it("creates invitation successfully for Owner", async () => {
      const ownerSession = {
        ...mockSession,
        user: { ...mockSession.user, role: "OWNER" },
      };

      mockInvitationFindFirst.mockResolvedValue(null);
      const mockInvitation = {
        id: "inv-1",
        tenantId: "tenant-1",
        email: "agent@example.com",
        role: "AGENT",
        token: "token-123",
        tokenHash: "hash-123",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        consumedAt: null,
        createdAt: new Date(),
      };

      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          invitation: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(mockInvitation),
          },
        };
        return fn(mockTx);
      });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: ownerSession as any,
      });
      const caller = createCaller(ctx);

      const result = await caller.invitations.createInvitation({
        email: "agent@example.com",
      });

      expect(result).toMatchObject({
        id: "inv-1",
        email: "agent@example.com",
        acceptLink: expect.stringContaining("/invite/accept?token="),
      });
      expect(mockTransaction).toHaveBeenCalled();
    });

    it("creates invitation successfully for Manager", async () => {
      mockInvitationFindFirst.mockResolvedValue(null);
      const mockInvitation = {
        id: "inv-1",
        tenantId: "tenant-1",
        email: "agent@example.com",
        role: "AGENT",
        token: "token-123",
        tokenHash: "hash-123",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        consumedAt: null,
        createdAt: new Date(),
      };

      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          invitation: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(mockInvitation),
          },
        };
        return fn(mockTx);
      });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: mockSession as any,
      });
      const caller = createCaller(ctx);

      const result = await caller.invitations.createInvitation({
        email: "agent@example.com",
      });

      expect(result).toMatchObject({
        id: "inv-1",
        email: "agent@example.com",
        acceptLink: expect.stringContaining("/invite/accept?token="),
      });
    });

    it("throws FORBIDDEN for non-Owner/Manager role", async () => {
      const agentSession = {
        ...mockSession,
        user: { ...mockSession.user, role: "AGENT" },
      };

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: agentSession as any,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.invitations.createInvitation({
          email: "agent@example.com",
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.invitations.createInvitation({
          email: "agent@example.com",
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: expect.stringContaining("Seuls Owner et Manager"),
      });

      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("throws CONFLICT when invitation already pending", async () => {
      const existingInvitation = {
        id: "inv-existing",
        tenantId: "tenant-1",
        email: "agent@example.com",
        consumedAt: null,
      };

      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          invitation: {
            findFirst: vi.fn().mockResolvedValue(existingInvitation),
            create: vi.fn(),
          },
        };
        return fn(mockTx);
      });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: mockSession as any,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.invitations.createInvitation({
          email: "agent@example.com",
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.invitations.createInvitation({
          email: "agent@example.com",
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: expect.stringContaining("Une invitation est déjà en attente"),
      });
    });

    it("throws TOO_MANY_REQUESTS when rate limit exceeded", async () => {
      mockCheckRateLimit.mockReturnValue(false);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: mockSession as any,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.invitations.createInvitation({
          email: "agent@example.com",
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.invitations.createInvitation({
          email: "agent@example.com",
        }),
      ).rejects.toMatchObject({
        code: "TOO_MANY_REQUESTS",
      });

      expect(mockTransaction).not.toHaveBeenCalled();
    });
  });

  describe("listInvitations", () => {
    const mockSession = {
      user: {
        id: "user-1",
        email: "manager@example.com",
        tenantId: "tenant-1",
        role: "MANAGER",
      },
    };

    it("lists invitations for Owner", async () => {
      const ownerSession = {
        ...mockSession,
        user: { ...mockSession.user, role: "OWNER" },
      };

      const mockInvitations = [
        {
          id: "inv-1",
          email: "agent1@example.com",
          role: "AGENT",
          expiresAt: new Date(),
          createdAt: new Date(),
        },
        {
          id: "inv-2",
          email: "agent2@example.com",
          role: "AGENT",
          expiresAt: new Date(),
          createdAt: new Date(),
        },
      ];

      mockInvitationFindMany.mockResolvedValue(mockInvitations);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: ownerSession as any,
      });
      const caller = createCaller(ctx);

      const result = await caller.invitations.listInvitations();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: "inv-1",
        email: "agent1@example.com",
        role: "AGENT",
      });
      expect(mockInvitationFindMany).toHaveBeenCalledWith({
        where: { tenantId: "tenant-1", consumedAt: null },
        orderBy: { createdAt: "desc" },
      });
    });

    it("throws FORBIDDEN for non-Owner/Manager role", async () => {
      const agentSession = {
        ...mockSession,
        user: { ...mockSession.user, role: "AGENT" },
      };

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: agentSession as any,
      });
      const caller = createCaller(ctx);

      await expect(caller.invitations.listInvitations()).rejects.toThrow(TRPCError);

      await expect(caller.invitations.listInvitations()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  });

  describe("getInvitationByToken", () => {
    it("returns invitation details for valid token", async () => {
      const mockInvitation = {
        id: "inv-1",
        tenantId: "tenant-1",
        email: "agent@example.com",
        role: "AGENT",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        consumedAt: null,
        tenant: {
          name: "Ma Boutique",
        },
      };

      mockInvitationFindFirst.mockResolvedValue(mockInvitation);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: null,
      });
      const caller = createCaller(ctx);

      const result = await caller.invitations.getInvitationByToken({
        token: "valid-token",
      });

      expect(result).toMatchObject({
        email: "agent@example.com",
        role: "AGENT",
        tenantName: "Ma Boutique",
        tenantId: "tenant-1",
      });
    });

    it("throws NOT_FOUND for expired invitation", async () => {
      const expiredInvitation = {
        id: "inv-1",
        tenantId: "tenant-1",
        email: "agent@example.com",
        role: "AGENT",
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        consumedAt: null,
        tenant: {
          name: "Ma Boutique",
        },
      };

      mockInvitationFindFirst.mockResolvedValue(expiredInvitation);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: null,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.invitations.getInvitationByToken({
          token: "expired-token",
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.invitations.getInvitationByToken({
          token: "expired-token",
        }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: expect.stringContaining("expiré"),
      });
    });

    it("throws NOT_FOUND for consumed invitation", async () => {
      const consumedInvitation = {
        id: "inv-1",
        tenantId: "tenant-1",
        email: "agent@example.com",
        role: "AGENT",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        consumedAt: new Date(),
        tenant: {
          name: "Ma Boutique",
        },
      };

      mockInvitationFindFirst.mockResolvedValue(consumedInvitation);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: null,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.invitations.getInvitationByToken({
          token: "consumed-token",
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.invitations.getInvitationByToken({
          token: "consumed-token",
        }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: expect.stringContaining("déjà été utilisée"),
      });
    });

    it("throws NOT_FOUND for non-existent token", async () => {
      mockInvitationFindFirst.mockResolvedValue(null);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: null,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.invitations.getInvitationByToken({
          token: "non-existent-token",
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.invitations.getInvitationByToken({
          token: "non-existent-token",
        }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });

  describe("acceptInvitation", () => {
    it("creates new user and consumes invitation", async () => {
      const mockInvitation = {
        id: "inv-1",
        tenantId: "tenant-1",
        email: "agent@example.com",
        role: "AGENT",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        consumedAt: null,
      };

      mockInvitationFindFirst.mockResolvedValue(mockInvitation);
      mockUserFindUnique.mockResolvedValue(null);

      const mockNewUser = {
        id: "user-new",
        tenantId: "tenant-1",
        email: "agent@example.com",
        name: "Jean Dupont",
        role: "AGENT",
      };

      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          user: {
            create: vi.fn().mockResolvedValue(mockNewUser),
          },
          invitation: {
            update: vi.fn().mockResolvedValue({
              ...mockInvitation,
              consumedAt: new Date(),
            }),
          },
        };
        return fn(mockTx);
      });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: null,
      });
      const caller = createCaller(ctx);

      const result = await caller.invitations.acceptInvitation({
        token: "valid-token",
        name: "Jean Dupont",
        password: "password123",
      });

      expect(result).toMatchObject({
        created: true,
        alreadyMember: false,
        userId: "user-new",
      });
      expect(mockHash).toHaveBeenCalledWith("password123", 10);
      expect(mockTransaction).toHaveBeenCalled();
    });

    it("throws CONFLICT when user already member of same tenant", async () => {
      const mockInvitation = {
        id: "inv-1",
        tenantId: "tenant-1",
        email: "agent@example.com",
        role: "AGENT",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        consumedAt: null,
      };

      const existingUser = {
        id: "user-existing",
        tenantId: "tenant-1",
        email: "agent@example.com",
      };

      mockInvitationFindFirst.mockResolvedValue(mockInvitation);
      mockUserFindUnique.mockResolvedValue(existingUser);
      mockInvitationUpdate.mockResolvedValue({
        ...mockInvitation,
        consumedAt: new Date(),
      });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: null,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.invitations.acceptInvitation({
          token: "valid-token",
          name: "Jean Dupont",
          password: "password123",
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.invitations.acceptInvitation({
          token: "valid-token",
          name: "Jean Dupont",
          password: "password123",
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: expect.stringContaining("déjà membre"),
      });
    });

    it("throws CONFLICT when user exists in different tenant", async () => {
      const mockInvitation = {
        id: "inv-1",
        tenantId: "tenant-1",
        email: "agent@example.com",
        role: "AGENT",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        consumedAt: null,
      };

      const existingUser = {
        id: "user-existing",
        tenantId: "tenant-2",
        email: "agent@example.com",
      };

      mockInvitationFindFirst.mockResolvedValue(mockInvitation);
      mockUserFindUnique.mockResolvedValue(existingUser);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: null,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.invitations.acceptInvitation({
          token: "valid-token",
          name: "Jean Dupont",
          password: "password123",
        }),
      ).rejects.toThrow(TRPCError);

      await expect(
        caller.invitations.acceptInvitation({
          token: "valid-token",
          name: "Jean Dupont",
          password: "password123",
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: expect.stringContaining("autre tenant"),
      });
    });
  });
});
