import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindMany = vi.hoisted(() => vi.fn());
const mockSyncPendingCatalogueItems = vi.hoisted(() => vi.fn());
const mockLoggerInfo = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    tenant: {
      findMany: mockFindMany,
    },
  },
}));

vi.mock("~/server/catalogue/syncCatalogueItemToMeta", () => ({
  syncPendingCatalogueItems: mockSyncPendingCatalogueItems,
}));

vi.mock("~/lib/logger", () => ({
  workerLogger: {
    info: mockLoggerInfo,
  },
}));

describe("runMetaCatalogueSyncJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.META_CATALOG_SYNC_ENABLED = "true";
  });

  it("returns skipped when catalogue sync is disabled", async () => {
    process.env.META_CATALOG_SYNC_ENABLED = "false";
    const { runMetaCatalogueSyncJob } = await import("./meta-catalogue-sync");

    await expect(runMetaCatalogueSyncJob()).resolves.toEqual({
      ok: true,
      skipped: true,
      reason: "sync_disabled",
    });
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("aggregates per-tenant sync results", async () => {
    mockFindMany.mockResolvedValue([{ id: "tenant-1" }, { id: "tenant-2" }]);
    mockSyncPendingCatalogueItems
      .mockResolvedValueOnce({ synced: 2, failed: 1 })
      .mockResolvedValueOnce({ synced: 1, failed: 0 });

    const { runMetaCatalogueSyncJob } = await import("./meta-catalogue-sync");

    await expect(runMetaCatalogueSyncJob()).resolves.toEqual({
      ok: true,
      tenants: 2,
      totalSynced: 3,
      totalFailed: 1,
    });
    expect(mockSyncPendingCatalogueItems).toHaveBeenNthCalledWith(1, "tenant-1");
    expect(mockSyncPendingCatalogueItems).toHaveBeenNthCalledWith(2, "tenant-2");
    expect(mockLoggerInfo).toHaveBeenCalledWith("Cron meta-catalogue-sync completed", {
      tenants: 2,
      totalSynced: 3,
      totalFailed: 1,
    });
  });
});
