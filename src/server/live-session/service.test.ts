import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Prisma } from "../../../generated/prisma";
import { getOrCreateCurrentSession, updateLastActivity } from "./service";
import { db } from "~/server/db";

vi.mock("~/server/db", () => ({
  db: {
    liveSession: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("~/server/live-session/config", () => ({
  getInactivityWindowMinutes: vi.fn(() => 45),
}));

describe("live-session service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getOrCreateCurrentSession", () => {
    it("should return existing session and update last_activity_at when active session in window", async () => {
      const tenantId = "tenant-1";
      const existingSession = {
        id: "session-1",
        tenantId,
        status: "active",
        lastActivityAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(db.liveSession.findFirst).mockResolvedValue(existingSession as never);
      vi.mocked(db.liveSession.update).mockResolvedValue({
        ...existingSession,
        lastActivityAt: new Date(),
      } as never);

      const result = await getOrCreateCurrentSession(tenantId);

      expect(result.id).toBe("session-1");
      expect(result.created).toBe(false);
      expect(db.liveSession.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId,
          status: "active",
          lastActivityAt: { gt: expect.any(Date) },
        },
        orderBy: { lastActivityAt: "desc" },
      });
      expect(db.liveSession.update).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: { lastActivityAt: expect.any(Date) },
      });
      expect(db.liveSession.create).not.toHaveBeenCalled();
    });

    it("should create new session when no active session in window", async () => {
      const tenantId = "tenant-2";
      vi.mocked(db.liveSession.findFirst).mockResolvedValue(null);
      const createdSession = {
        id: "session-new",
        tenantId,
        status: "active",
        lastActivityAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(db.liveSession.create).mockResolvedValue(createdSession as never);

      const result = await getOrCreateCurrentSession(tenantId);

      expect(result.id).toBe("session-new");
      expect(result.created).toBe(true);
      expect(db.liveSession.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          status: "active",
          lastActivityAt: expect.any(Date),
        },
      });
      expect(db.liveSession.update).not.toHaveBeenCalled();
    });

    it("should on concurrent create (P2002) retry and return the session created by the other", async () => {
      const tenantId = "tenant-concurrent";
      const sessionCreatedByOther = {
        id: "session-other",
        tenantId,
        status: "active",
        lastActivityAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(db.liveSession.findFirst)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(sessionCreatedByOther as never);
      vi.mocked(db.liveSession.create).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "test",
        }),
      );
      vi.mocked(db.liveSession.update).mockResolvedValue({
        ...sessionCreatedByOther,
        lastActivityAt: new Date(),
      } as never);

      const result = await getOrCreateCurrentSession(tenantId);

      expect(result.id).toBe("session-other");
      expect(result.created).toBe(false);
      expect(db.liveSession.findFirst).toHaveBeenCalledTimes(2);
      expect(db.liveSession.update).toHaveBeenCalledWith({
        where: { id: "session-other" },
        data: { lastActivityAt: expect.any(Date) },
      });
    });
  });

  describe("updateLastActivity", () => {
    it("should update last_activity_at for given session", async () => {
      const sessionId = "session-1";
      vi.mocked(db.liveSession.update).mockResolvedValue({} as never);

      await updateLastActivity(sessionId);

      expect(db.liveSession.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: { lastActivityAt: expect.any(Date) },
      });
    });
  });
});
