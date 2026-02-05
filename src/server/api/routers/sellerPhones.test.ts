import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

const mockSellerPhoneFindMany = vi.hoisted(() => vi.fn());
const mockSellerPhoneFindUnique = vi.hoisted(() => vi.fn());
const mockSellerPhoneCreate = vi.hoisted(() => vi.fn());
const mockSellerPhoneDeleteMany = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    sellerPhone: {
      findMany: mockSellerPhoneFindMany,
      findUnique: mockSellerPhoneFindUnique,
      create: mockSellerPhoneCreate,
      deleteMany: mockSellerPhoneDeleteMany,
    },
  },
}));

describe("sellerPhones router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const managerSession = {
    user: {
      id: "user-1",
      email: "manager@example.com",
      tenantId: "tenant-1",
      role: "MANAGER",
    },
  };

  const agentSession = {
    user: {
      id: "user-2",
      email: "agent@example.com",
      tenantId: "tenant-1",
      role: "AGENT",
    },
  };

  describe("list", () => {
    it("returns seller phones for tenant when Owner/Manager", async () => {
      const list = [
        {
          id: "sp-1",
          phoneNumber: "+33612345678",
          createdAt: new Date(),
        },
      ];
      mockSellerPhoneFindMany.mockResolvedValue(list);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: managerSession as any,
      });
      const caller = createCaller(ctx);

      const result = await caller.sellerPhones.list();

      expect(result).toEqual(list);
      expect(mockSellerPhoneFindMany).toHaveBeenCalledWith({
        where: { tenantId: "tenant-1" },
        orderBy: { createdAt: "asc" },
        select: { id: true, phoneNumber: true, createdAt: true },
      });
    });

    it("throws FORBIDDEN for non-Owner/Manager role", async () => {
      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: agentSession as any,
      });
      const caller = createCaller(ctx);

      await expect(caller.sellerPhones.list()).rejects.toThrow(TRPCError);
      await expect(caller.sellerPhones.list()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(mockSellerPhoneFindMany).not.toHaveBeenCalled();
    });
  });

  describe("add", () => {
    it("creates seller phone with E.164 and returns it", async () => {
      mockSellerPhoneFindUnique.mockResolvedValue(null);
      const created = {
        id: "sp-new",
        phoneNumber: "+33612345678",
        createdAt: new Date(),
      };
      mockSellerPhoneCreate.mockResolvedValue(created);

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: managerSession as any,
      });
      const caller = createCaller(ctx);

      const result = await caller.sellerPhones.add({
        phoneNumber: " +33612345678 ",
      });

      expect(result).toEqual(created);
      expect(mockSellerPhoneCreate).toHaveBeenCalledWith({
        data: { tenantId: "tenant-1", phoneNumber: "+33612345678" },
        select: { id: true, phoneNumber: true, createdAt: true },
      });
    });

    it("throws CONFLICT when number already exists for tenant", async () => {
      mockSellerPhoneFindUnique.mockResolvedValue({
        id: "sp-1",
        tenantId: "tenant-1",
        phoneNumber: "+33612345678",
      });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: managerSession as any,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.sellerPhones.add({ phoneNumber: "+33612345678" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(mockSellerPhoneCreate).not.toHaveBeenCalled();
    });

    it("throws FORBIDDEN for non-Owner/Manager", async () => {
      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: agentSession as any,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.sellerPhones.add({ phoneNumber: "+33612345678" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("rejects invalid E.164 (validation)", async () => {
      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: managerSession as any,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.sellerPhones.add({ phoneNumber: "33612345678" }),
      ).rejects.toThrow();
      expect(mockSellerPhoneFindUnique).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("deletes seller phone when id belongs to tenant", async () => {
      mockSellerPhoneDeleteMany.mockResolvedValue({ count: 1 });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: managerSession as any,
      });
      const caller = createCaller(ctx);

      const result = await caller.sellerPhones.remove({ id: "sp-1" });

      expect(result).toEqual({ ok: true });
      expect(mockSellerPhoneDeleteMany).toHaveBeenCalledWith({
        where: { id: "sp-1", tenantId: "tenant-1" },
      });
    });

    it("throws NOT_FOUND when no row deleted", async () => {
      mockSellerPhoneDeleteMany.mockResolvedValue({ count: 0 });

      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: managerSession as any,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.sellerPhones.remove({ id: "other-tenant-sp" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("throws FORBIDDEN for non-Owner/Manager", async () => {
      const ctx = await createTRPCContext({
        headers: new Headers(),
        session: agentSession as any,
      });
      const caller = createCaller(ctx);

      await expect(
        caller.sellerPhones.remove({ id: "sp-1" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mockSellerPhoneDeleteMany).not.toHaveBeenCalled();
    });
  });
});
