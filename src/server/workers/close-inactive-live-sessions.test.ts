import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runCloseInactiveLiveSessions } from "./close-inactive-live-sessions";
import { db } from "~/server/db";
import { logLiveSessionClosed } from "~/server/events/eventLog";
import { promoteSessionToCatalogue } from "~/server/catalogue/promoteSessionToCatalogue";

vi.mock("~/server/db", () => ({
  db: {
    liveSession: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("~/server/events/eventLog", () => ({
  logLiveSessionClosed: vi.fn(),
}));

vi.mock("~/server/catalogue/promoteSessionToCatalogue", () => ({
  promoteSessionToCatalogue: vi.fn(),
}));

vi.mock("~/server/live-session/config", () => ({
  getInactivityWindowMinutes: vi.fn(() => 45),
}));

vi.mock("~/lib/logger", () => ({
  workerLogger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("close-inactive-live-sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(logLiveSessionClosed).mockResolvedValue();
    vi.mocked(promoteSessionToCatalogue).mockResolvedValue({
      itemsProcessed: 2,
      itemsCreated: 1,
      itemsUpdated: 1,
      itemsSkipped: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("runCloseInactiveLiveSessions", () => {
    it("should close sessions where last_activity_at < now - INACTIVITY_WINDOW", async () => {
      const toClose = [
        { id: "session-1", tenantId: "tenant-1" },
        { id: "session-2", tenantId: "tenant-2" },
      ];
      vi.mocked(db.liveSession.findMany).mockResolvedValue(toClose as never);
      vi.mocked(db.liveSession.update).mockResolvedValue({} as never);

      const result = await runCloseInactiveLiveSessions();

      expect(result.closedCount).toBe(2);
      expect(result.closedIds).toEqual(["session-1", "session-2"]);
      expect(db.liveSession.findMany).toHaveBeenCalledWith({
        where: {
          status: "active",
          lastActivityAt: { lt: expect.any(Date) },
        },
        select: { id: true, tenantId: true },
        take: 100,
        orderBy: { lastActivityAt: "asc" },
      });
      expect(db.liveSession.update).toHaveBeenCalledTimes(2);
      expect(db.liveSession.update).toHaveBeenNthCalledWith(1, {
        where: { id: "session-1" },
        data: { status: "closed" },
      });
      expect(db.liveSession.update).toHaveBeenNthCalledWith(2, {
        where: { id: "session-2" },
        data: { status: "closed" },
      });
      expect(logLiveSessionClosed).toHaveBeenCalledWith("tenant-1", "session-1", "live-session-session-1");
      expect(logLiveSessionClosed).toHaveBeenCalledWith("tenant-2", "session-2", "live-session-session-2");

      // Story 8.2: Vérifier que la promotion catalogue est appelée pour chaque session
      expect(promoteSessionToCatalogue).toHaveBeenCalledTimes(2);
      expect(promoteSessionToCatalogue).toHaveBeenNthCalledWith(1, "tenant-1", "session-1");
      expect(promoteSessionToCatalogue).toHaveBeenNthCalledWith(2, "tenant-2", "session-2");
    });

    it("should return zero closed when no inactive sessions", async () => {
      vi.mocked(db.liveSession.findMany).mockResolvedValue([]);

      const result = await runCloseInactiveLiveSessions();

      expect(result.closedCount).toBe(0);
      expect(result.closedIds).toEqual([]);
      expect(db.liveSession.update).not.toHaveBeenCalled();
      expect(logLiveSessionClosed).not.toHaveBeenCalled();
    });

    it("should continue closing other sessions if one update fails", async () => {
      const toClose = [
        { id: "session-1", tenantId: "tenant-1" },
        { id: "session-2", tenantId: "tenant-2" },
      ];
      vi.mocked(db.liveSession.findMany).mockResolvedValue(toClose as never);
      vi.mocked(db.liveSession.update)
        .mockRejectedValueOnce(new Error("DB error"))
        .mockResolvedValueOnce({} as never);

      const result = await runCloseInactiveLiveSessions();

      expect(result.closedCount).toBe(1);
      expect(result.closedIds).toEqual(["session-2"]);
      expect(db.liveSession.update).toHaveBeenCalledTimes(2);
      expect(logLiveSessionClosed).toHaveBeenCalledTimes(1);
      expect(logLiveSessionClosed).toHaveBeenCalledWith("tenant-2", "session-2", "live-session-session-2");
    });

    it("should close session even if promotion to catalogue fails (Story 8.2)", async () => {
      const toClose = [{ id: "session-1", tenantId: "tenant-1" }];
      vi.mocked(db.liveSession.findMany).mockResolvedValue(toClose as never);
      vi.mocked(db.liveSession.update).mockResolvedValue({} as never);
      vi.mocked(promoteSessionToCatalogue).mockRejectedValue(new Error("Promotion error"));

      const result = await runCloseInactiveLiveSessions();

      // La session doit être fermée même si la promotion échoue
      expect(result.closedCount).toBe(1);
      expect(result.closedIds).toEqual(["session-1"]);
      expect(db.liveSession.update).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: { status: "closed" },
      });
      expect(logLiveSessionClosed).toHaveBeenCalledWith("tenant-1", "session-1", "live-session-session-1");
      expect(promoteSessionToCatalogue).toHaveBeenCalledWith("tenant-1", "session-1");
    });
  });
});
