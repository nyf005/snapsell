import { describe, it, expect, vi, beforeEach } from "vitest";
import { getLastEditedLiveItemInWindow } from "./getLastEditedLiveItemInWindow";
import { db } from "~/server/db";
import { getOrCreateCurrentSession } from "~/server/live-session/service";

vi.mock("~/server/db", () => ({
  db: {
    liveItem: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("~/server/live-session/service", () => ({
  getOrCreateCurrentSession: vi.fn().mockResolvedValue({
    id: "session-1",
    status: "active",
    lastActivityAt: new Date(),
    created: false,
  }),
}));

describe("getLastEditedLiveItemInWindow (Story 3.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOrCreateCurrentSession).mockResolvedValue({
      id: "session-1",
      status: "active",
      lastActivityAt: new Date(),
      created: false,
    });
  });

  it("returns last LiveItem in window when one exists", async () => {
    vi.mocked(db.liveItem.findFirst).mockResolvedValue({
      id: "item-1",
      code: "A12",
      liveSessionId: "session-1",
    } as never);

    const result = await getLastEditedLiveItemInWindow("tenant-1", 2 * 60 * 1000);

    expect(result).toEqual({
      id: "item-1",
      code: "A12",
      liveSessionId: "session-1",
    });
    expect(db.liveItem.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        liveSessionId: "session-1",
        updatedAt: { gte: expect.any(Date) },
      },
      orderBy: { updatedAt: "desc" },
      take: 1,
      select: { id: true, code: true, liveSessionId: true },
    });
  });

  it("returns null when no item in window", async () => {
    vi.mocked(db.liveItem.findFirst).mockResolvedValue(null);

    const result = await getLastEditedLiveItemInWindow("tenant-1", 2 * 60 * 1000);

    expect(result).toBeNull();
  });
});
