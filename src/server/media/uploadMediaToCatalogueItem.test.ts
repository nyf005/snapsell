import { describe, it, expect, vi, beforeEach } from "vitest";
import { uploadMediaToCatalogueItem } from "./uploadMediaToCatalogueItem";

// Mock r2-client
vi.mock("~/server/media/r2-client", () => ({
  isR2Configured: vi.fn(),
  createR2Client: vi.fn(),
  getR2BucketName: vi.fn().mockReturnValue("test-bucket"),
}));

// Mock db
vi.mock("~/server/db", () => ({
  db: {
    catalogueItem: {
      update: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock("~/lib/logger", () => ({
  workerLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("uploadMediaToCatalogueItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("should upload media to R2 and update CatalogueItem.mediaStorageKey", async () => {
    const { isR2Configured, createR2Client, getR2BucketName } = await import(
      "~/server/media/r2-client"
    );
    vi.mocked(isR2Configured).mockReturnValue(true);
    const mockSend = vi.fn().mockResolvedValue({});
    vi.mocked(createR2Client).mockReturnValue({ send: mockSend } as never);

    const { db } = await import("~/server/db");
    vi.mocked(db.catalogueItem.update).mockResolvedValue({} as never);

    const mockResponse = {
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      headers: new Headers({ "content-type": "image/jpeg" }),
    };
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as never);

    await uploadMediaToCatalogueItem(
      "tenant-1",
      "cat-item-1",
      "https://example.com/media/123",
      "corr-1",
    );

    expect(globalThis.fetch).toHaveBeenCalledWith("https://example.com/media/123", {
      headers: {},
    });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: "test-bucket",
          Key: "tenants/tenant-1/catalogue-items/cat-item-1/photo",
          ContentType: "image/jpeg",
        }),
      }),
    );
    expect(db.catalogueItem.update).toHaveBeenCalledWith({
      where: { id: "cat-item-1", tenantId: "tenant-1" },
      data: { mediaStorageKey: "tenants/tenant-1/catalogue-items/cat-item-1/photo" },
    });
  });

  it("should return early (no-op) when R2 is not configured", async () => {
    const { isR2Configured } = await import("~/server/media/r2-client");
    vi.mocked(isR2Configured).mockReturnValue(false);

    const { db } = await import("~/server/db");

    await uploadMediaToCatalogueItem(
      "tenant-1",
      "cat-item-1",
      "https://example.com/media/123",
      "corr-1",
    );

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(db.catalogueItem.update).not.toHaveBeenCalled();
  });

  it("should throw when fetch fails (non-ok response)", async () => {
    const { isR2Configured } = await import("~/server/media/r2-client");
    vi.mocked(isR2Configured).mockReturnValue(true);

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as never);

    await expect(
      uploadMediaToCatalogueItem(
        "tenant-1",
        "cat-item-1",
        "https://example.com/media/123",
        "corr-1",
      ),
    ).rejects.toThrow("Failed to fetch media: 404 Not Found");
  });

  it("should throw when R2 upload fails", async () => {
    const { isR2Configured, createR2Client } = await import("~/server/media/r2-client");
    vi.mocked(isR2Configured).mockReturnValue(true);
    const mockSend = vi.fn().mockRejectedValue(new Error("R2 upload failed"));
    vi.mocked(createR2Client).mockReturnValue({ send: mockSend } as never);

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      headers: new Headers({ "content-type": "image/png" }),
    } as never);

    await expect(
      uploadMediaToCatalogueItem(
        "tenant-1",
        "cat-item-1",
        "https://example.com/media/123",
        "corr-1",
      ),
    ).rejects.toThrow("R2 upload failed");
  });

  it("should return early for invalid mediaUrl", async () => {
    const { isR2Configured } = await import("~/server/media/r2-client");
    vi.mocked(isR2Configured).mockReturnValue(true);

    const { db } = await import("~/server/db");

    await uploadMediaToCatalogueItem(
      "tenant-1",
      "cat-item-1",
      "not-a-url",
      "corr-1",
    );

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(db.catalogueItem.update).not.toHaveBeenCalled();
  });

  it("should skip upload for unsupported content-type (L2 fix)", async () => {
    const { isR2Configured, createR2Client } = await import("~/server/media/r2-client");
    vi.mocked(isR2Configured).mockReturnValue(true);
    const mockSend = vi.fn().mockResolvedValue({});
    vi.mocked(createR2Client).mockReturnValue({ send: mockSend } as never);

    const { db } = await import("~/server/db");

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      headers: new Headers({ "content-type": "application/pdf" }),
    } as never);

    await uploadMediaToCatalogueItem(
      "tenant-1",
      "cat-item-1",
      "https://example.com/media/123",
      "corr-1",
    );

    expect(mockSend).not.toHaveBeenCalled();
    expect(db.catalogueItem.update).not.toHaveBeenCalled();
  });

  it("should skip upload when media is too large (L3 fix, >10 Mo)", async () => {
    const { isR2Configured, createR2Client } = await import("~/server/media/r2-client");
    vi.mocked(isR2Configured).mockReturnValue(true);
    const mockSend = vi.fn().mockResolvedValue({});
    vi.mocked(createR2Client).mockReturnValue({ send: mockSend } as never);

    const { db } = await import("~/server/db");

    // 11 Mo (dépasse la limite de 10 Mo)
    const largeBuffer = new ArrayBuffer(11 * 1024 * 1024);
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(largeBuffer),
      headers: new Headers({ "content-type": "image/jpeg" }),
    } as never);

    await uploadMediaToCatalogueItem(
      "tenant-1",
      "cat-item-1",
      "https://example.com/media/123",
      "corr-1",
    );

    expect(mockSend).not.toHaveBeenCalled();
    expect(db.catalogueItem.update).not.toHaveBeenCalled();
  });

  it("should no longer accept application/octet-stream (L2 fix)", async () => {
    const { isR2Configured, createR2Client } = await import("~/server/media/r2-client");
    vi.mocked(isR2Configured).mockReturnValue(true);
    const mockSend = vi.fn().mockResolvedValue({});
    vi.mocked(createR2Client).mockReturnValue({ send: mockSend } as never);

    const { db } = await import("~/server/db");

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      headers: new Headers({}),
    } as never);

    await uploadMediaToCatalogueItem(
      "tenant-1",
      "cat-item-1",
      "https://example.com/media/123",
      "corr-1",
    );

    // application/octet-stream (default when no content-type) is rejected
    expect(mockSend).not.toHaveBeenCalled();
    expect(db.catalogueItem.update).not.toHaveBeenCalled();
  });

  it("should wrap errors with try/catch and re-throw (M2 fix)", async () => {
    const { isR2Configured } = await import("~/server/media/r2-client");
    vi.mocked(isR2Configured).mockReturnValue(true);
    const { workerLogger } = await import("~/lib/logger");

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as never);

    await expect(
      uploadMediaToCatalogueItem(
        "tenant-1",
        "cat-item-1",
        "https://example.com/media/123",
        "corr-1",
      ),
    ).rejects.toThrow("Failed to fetch media: 500 Internal Server Error");

    // M2 fix: error is logged before being re-thrown
    expect(workerLogger.error).toHaveBeenCalledWith(
      "Error uploading media to R2 and linking to CatalogueItem",
      expect.any(Error),
      expect.objectContaining({
        correlationId: "corr-1",
        tenantId: "tenant-1",
        catalogueItemId: "cat-item-1",
      }),
    );
  });
});
