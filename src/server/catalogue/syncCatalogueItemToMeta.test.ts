/**
 * Tests pour syncCatalogueItemToMeta — synchro catalogue vers Meta Commerce Manager
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "~/server/db";

vi.mock("~/server/db", () => ({
  db: {
    catalogueItem: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    itemVariant: {
      findMany: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("~/lib/logger", () => ({
  workerLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("~/env.js", () => ({
  env: {
    META_CATALOG_SYNC_ENABLED: "true",
    NEXT_PUBLIC_APP_URL: "https://app.example.com",
    CATALOGUE_PLACEHOLDER_IMAGE_URL: undefined,
  },
}));

import {
  syncCatalogueItemToMeta,
  syncPendingCatalogueItems,
} from "./syncCatalogueItemToMeta";

const TENANT_ID = "tenant-1";
const ITEM_ID = "item-1";

const mockItem = {
  id: ITEM_ID,
  tenantId: TENANT_ID,
  code: "A12",
  name: "Robe fleurie",
  amount: 500000,
  availableQty: 5,
  mediaStorageKey: "tenants/t1/items/i1/photo",
  metaProductId: null,
  syncedToMeta: false,
};

const mockTenant = {
  hasMetaCatalogSync: true,
  metaCatalogId: "catalog-123",
  metaAccessToken: "access-token-abc",
};

describe("syncCatalogueItemToMeta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.itemVariant.findMany).mockResolvedValue([]);
  });

  it("retourne sync_disabled si META_CATALOG_SYNC_ENABLED !== true", async () => {
    vi.resetModules();
    vi.doMock("~/env.js", () => ({
      env: {
        META_CATALOG_SYNC_ENABLED: "false",
        NEXT_PUBLIC_APP_URL: "https://app.example.com",
        CATALOGUE_PLACEHOLDER_IMAGE_URL: undefined,
      },
    }));

    const { syncCatalogueItemToMeta: fn } = await import("./syncCatalogueItemToMeta");

    const result = await fn(TENANT_ID, ITEM_ID);

    expect(result).toEqual({ success: false, reason: "sync_disabled" });
  });

  it("retourne no_entitlement si hasMetaCatalogSync = false", async () => {
    vi.mocked(db.catalogueItem.findUnique).mockResolvedValue(mockItem as never);
    vi.mocked(db.tenant.findUnique).mockResolvedValue({
      ...mockTenant,
      hasMetaCatalogSync: false,
    } as never);

    const result = await syncCatalogueItemToMeta(TENANT_ID, ITEM_ID);

    expect(result).toEqual({ success: false, reason: "no_entitlement" });
  });

  it("retourne no_catalog_configured si metaCatalogId est null", async () => {
    vi.mocked(db.catalogueItem.findUnique).mockResolvedValue(mockItem as never);
    vi.mocked(db.tenant.findUnique).mockResolvedValue({
      ...mockTenant,
      metaCatalogId: null,
    } as never);

    const result = await syncCatalogueItemToMeta(TENANT_ID, ITEM_ID);

    expect(result).toEqual({ success: false, reason: "no_catalog_configured" });
  });

  it("retourne missing_name si l'article n'a pas de nom", async () => {
    vi.mocked(db.catalogueItem.findUnique).mockResolvedValue({
      ...mockItem,
      name: null,
    } as never);
    vi.mocked(db.tenant.findUnique).mockResolvedValue(mockTenant as never);

    const result = await syncCatalogueItemToMeta(TENANT_ID, ITEM_ID);

    expect(result).toEqual({ success: false, reason: "missing_name" });
  });

  it("retourne missing_image si l'article n'a pas de mediaStorageKey", async () => {
    vi.mocked(db.catalogueItem.findUnique).mockResolvedValue({
      ...mockItem,
      mediaStorageKey: null,
    } as never);
    vi.mocked(db.tenant.findUnique).mockResolvedValue(mockTenant as never);

    const result = await syncCatalogueItemToMeta(TENANT_ID, ITEM_ID);

    expect(result).toEqual({ success: false, reason: "missing_image" });
  });

  it("retourne success et stocke metaProductId si l'API Meta répond 200", async () => {
    vi.mocked(db.catalogueItem.findUnique).mockResolvedValue(mockItem as never);
    vi.mocked(db.tenant.findUnique).mockResolvedValue(mockTenant as never);
    vi.mocked(db.catalogueItem.update).mockResolvedValue({} as never);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "meta-product-456" }),
    } as Response);

    const result = await syncCatalogueItemToMeta(TENANT_ID, ITEM_ID);

    expect(result).toEqual({ success: true, metaProductId: "meta-product-456", created: true });
    expect(db.catalogueItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metaProductId: "meta-product-456",
          syncedToMeta: true,
        }),
      }),
    );
  });

  it("retourne rate_limited si l'API Meta répond 429 après 3 tentatives", async () => {
    vi.mocked(db.catalogueItem.findUnique).mockResolvedValue(mockItem as never);
    vi.mocked(db.tenant.findUnique).mockResolvedValue(mockTenant as never);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "Rate Limited",
    } as Response);

    const result = await syncCatalogueItemToMeta(TENANT_ID, ITEM_ID);

    expect(result).toEqual({ success: false, reason: "rate_limited" });
    // 3 tentatives max
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });
});

describe("syncPendingCatalogueItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.itemVariant.findMany).mockResolvedValue([]);
  });

  it("retourne synced=0 failed=0 si aucun article éligible", async () => {
    vi.mocked(db.catalogueItem.findMany).mockResolvedValue([]);
    vi.mocked(db.tenant.findUnique).mockResolvedValue(mockTenant as never);

    const result = await syncPendingCatalogueItems(TENANT_ID);

    expect(result).toEqual({ synced: 0, failed: 0 });
  });

  it("compte correctement les succès et échecs", async () => {
    vi.mocked(db.catalogueItem.findMany).mockResolvedValue([
      { id: "item-1" },
      { id: "item-2" },
    ] as never);

    // item-1 : succès
    vi.mocked(db.catalogueItem.findUnique)
      .mockResolvedValueOnce(mockItem as never)   // item-1
      .mockResolvedValueOnce({ ...mockItem, id: "item-2", name: null } as never); // item-2 sans nom

    vi.mocked(db.tenant.findUnique).mockResolvedValue(mockTenant as never);
    vi.mocked(db.catalogueItem.update).mockResolvedValue({} as never);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "meta-product-xyz" }),
    } as Response);

    const result = await syncPendingCatalogueItems(TENANT_ID);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(1);
  });
});
