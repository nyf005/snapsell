import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  mockOptOutFindUnique: vi.fn(),
}));
vi.mock("~/server/db", () => ({
  db: {
    optOut: {
      findUnique: mocks.mockOptOutFindUnique,
    },
  },
}));

import { checkOptOut } from "./optout";

describe("optout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkOptOut", () => {
    it("should return true when OptOut exists for (tenantId, phoneNumber)", async () => {
      mocks.mockOptOutFindUnique.mockResolvedValue({
        id: "opt-1",
        tenantId: "tenant-123",
        phoneNumber: "+33612345678",
        optedOutAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await checkOptOut("tenant-123", "+33612345678");

      expect(result).toBe(true);
      expect(mocks.mockOptOutFindUnique).toHaveBeenCalledWith({
        where: {
          tenantId_phoneNumber: { tenantId: "tenant-123", phoneNumber: "+33612345678" },
        },
      });
    });

    it("should return false when OptOut does not exist", async () => {
      mocks.mockOptOutFindUnique.mockResolvedValue(null);

      const result = await checkOptOut("tenant-123", "+33698765432");

      expect(result).toBe(false);
      expect(mocks.mockOptOutFindUnique).toHaveBeenCalledWith({
        where: {
          tenantId_phoneNumber: { tenantId: "tenant-123", phoneNumber: "+33698765432" },
        },
      });
    });

    it("should normalize phone with whatsapp: prefix before lookup", async () => {
      mocks.mockOptOutFindUnique.mockResolvedValue(null);

      await checkOptOut("tenant-123", "whatsapp:+33612345678");

      expect(mocks.mockOptOutFindUnique).toHaveBeenCalledWith({
        where: {
          tenantId_phoneNumber: { tenantId: "tenant-123", phoneNumber: "+33612345678" },
        },
      });
    });
  });
});
