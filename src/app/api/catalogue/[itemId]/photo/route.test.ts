/**
 * Story 9.2 Task 1: Tests API route /api/catalogue/[itemId]/photo
 * POST (upload), GET (serve), DELETE (remove)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing route
vi.mock("~/server/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("~/server/db", () => ({
  db: {
    catalogueItem: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock("~/server/media/r2-client", () => ({
  isR2Configured: vi.fn(),
  createR2Client: vi.fn(),
  getR2BucketName: vi.fn(),
}));
vi.mock("@aws-sdk/client-s3", () => ({
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  S3Client: vi.fn(),
}));

import { POST, GET, DELETE } from "./route";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { isR2Configured, createR2Client, getR2BucketName } from "~/server/media/r2-client";

const mockSession = {
  user: {
    id: "user-1",
    tenantId: "tenant-1",
    role: "OWNER",
  },
};

const mockItem = {
  id: "item-1",
  tenantId: "tenant-1",
  mediaStorageKey: null,
};

const mockItemWithPhoto = {
  id: "item-1",
  tenantId: "tenant-1",
  mediaStorageKey: "tenants/tenant-1/catalogue-items/item-1/photo",
};

function makeParams(itemId: string) {
  return { params: Promise.resolve({ itemId }) };
}

function makeFileFormData(
  content = "fake-image-data",
  type = "image/jpeg",
  name = "photo.jpg",
): FormData {
  const blob = new Blob([content], { type });
  const file = new File([blob], name, { type });
  const formData = new FormData();
  formData.append("file", file);
  return formData;
}

function makeRequest(formData: FormData): Request {
  return new Request("http://localhost/api/catalogue/item-1/photo", {
    method: "POST",
    body: formData,
  });
}

describe("Story 9.2: API /api/catalogue/[itemId]/photo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(isR2Configured).mockReturnValue(true);
    vi.mocked(getR2BucketName).mockReturnValue("test-bucket");
    vi.mocked(createR2Client).mockReturnValue({
      send: vi.fn().mockResolvedValue({}),
    } as never);
  });

  // ─── POST (upload) ────────────────────────────────────────────────

  describe("POST", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const req = makeRequest(makeFileFormData());
      const res = await POST(req, makeParams("item-1"));
      expect(res.status).toBe(401);
    });

    it("returns 401 when user has no tenantId", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-1", tenantId: null },
      } as never);

      const req = makeRequest(makeFileFormData());
      const res = await POST(req, makeParams("item-1"));
      expect(res.status).toBe(401);
    });

    it("returns 503 when R2 is not configured", async () => {
      vi.mocked(isR2Configured).mockReturnValue(false);

      const req = makeRequest(makeFileFormData());
      const res = await POST(req, makeParams("item-1"));
      expect(res.status).toBe(503);
    });

    it("returns 400 when no file provided", async () => {
      const formData = new FormData();
      const req = new Request("http://localhost/api/catalogue/item-1/photo", {
        method: "POST",
        body: formData,
      });

      vi.mocked(db.catalogueItem.findFirst).mockResolvedValue(mockItem as never);

      const res = await POST(req, makeParams("item-1"));
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid file type", async () => {
      vi.mocked(db.catalogueItem.findFirst).mockResolvedValue(mockItem as never);

      const formData = makeFileFormData("data", "application/pdf", "doc.pdf");
      const req = makeRequest(formData);
      const res = await POST(req, makeParams("item-1"));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/type/i);
    });

    it("returns 400 for file exceeding 5 MB", async () => {
      vi.mocked(db.catalogueItem.findFirst).mockResolvedValue(mockItem as never);

      // Create a blob slightly over 5 MB
      const largeBlob = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/jpeg" });
      const largeFile = new File([largeBlob], "big.jpg", { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("file", largeFile);
      const req = makeRequest(formData);
      const res = await POST(req, makeParams("item-1"));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/taille|size|5/i);
    });

    it("returns 404 when item does not exist", async () => {
      vi.mocked(db.catalogueItem.findFirst).mockResolvedValue(null);

      const req = makeRequest(makeFileFormData());
      const res = await POST(req, makeParams("item-1"));
      expect(res.status).toBe(404);
    });

    it("uploads to R2 and updates mediaStorageKey on success", async () => {
      vi.mocked(db.catalogueItem.findFirst).mockResolvedValue(mockItem as never);
      vi.mocked(db.catalogueItem.update).mockResolvedValue(mockItemWithPhoto as never);
      const mockSend = vi.fn().mockResolvedValue({});
      vi.mocked(createR2Client).mockReturnValue({ send: mockSend } as never);

      const req = makeRequest(makeFileFormData());
      const res = await POST(req, makeParams("item-1"));

      expect(res.status).toBe(200);
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(db.catalogueItem.update).toHaveBeenCalledWith({
        where: { id: "item-1" },
        data: { mediaStorageKey: "tenants/tenant-1/catalogue-items/item-1/photo" },
      });
    });

    it("accepts image/jpeg, image/png, image/webp", async () => {
      vi.mocked(db.catalogueItem.findFirst).mockResolvedValue(mockItem as never);
      vi.mocked(db.catalogueItem.update).mockResolvedValue(mockItemWithPhoto as never);
      const mockSend = vi.fn().mockResolvedValue({});
      vi.mocked(createR2Client).mockReturnValue({ send: mockSend } as never);

      for (const type of ["image/jpeg", "image/png", "image/webp"]) {
        vi.clearAllMocks();
        vi.mocked(auth).mockResolvedValue(mockSession as never);
        vi.mocked(isR2Configured).mockReturnValue(true);
        vi.mocked(getR2BucketName).mockReturnValue("test-bucket");
        vi.mocked(createR2Client).mockReturnValue({ send: mockSend } as never);
        vi.mocked(db.catalogueItem.findFirst).mockResolvedValue(mockItem as never);
        vi.mocked(db.catalogueItem.update).mockResolvedValue(mockItemWithPhoto as never);

        const formData = makeFileFormData("data", type, `photo.${type.split("/")[1]}`);
        const req = makeRequest(formData);
        const res = await POST(req, makeParams("item-1"));
        expect(res.status).toBe(200);
      }
    });
  });

  // ─── GET (serve) ──────────────────────────────────────────────────

  describe("GET", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const req = new Request("http://localhost/api/catalogue/item-1/photo");
      const res = await GET(req, makeParams("item-1"));
      expect(res.status).toBe(401);
    });

    it("returns 404 when item has no mediaStorageKey", async () => {
      vi.mocked(db.catalogueItem.findFirst).mockResolvedValue(mockItem as never);

      const req = new Request("http://localhost/api/catalogue/item-1/photo");
      const res = await GET(req, makeParams("item-1"));
      expect(res.status).toBe(404);
    });

    it("returns 404 when item does not exist or wrong tenant", async () => {
      vi.mocked(db.catalogueItem.findFirst).mockResolvedValue(null);

      const req = new Request("http://localhost/api/catalogue/item-1/photo");
      const res = await GET(req, makeParams("item-1"));
      expect(res.status).toBe(404);
    });

    it("returns 503 when R2 not configured", async () => {
      vi.mocked(db.catalogueItem.findFirst).mockResolvedValue(mockItemWithPhoto as never);
      vi.mocked(isR2Configured).mockReturnValue(false);

      const req = new Request("http://localhost/api/catalogue/item-1/photo");
      const res = await GET(req, makeParams("item-1"));
      expect(res.status).toBe(503);
    });

    it("serves image from R2 with correct Content-Type", async () => {
      vi.mocked(db.catalogueItem.findFirst).mockResolvedValue(mockItemWithPhoto as never);

      const imageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const mockBody = {
        transformToByteArray: vi.fn().mockResolvedValue(imageBytes),
      };
      const mockSend = vi.fn().mockResolvedValue({
        Body: mockBody,
        ContentType: "image/jpeg",
      });
      vi.mocked(createR2Client).mockReturnValue({ send: mockSend } as never);

      const req = new Request("http://localhost/api/catalogue/item-1/photo");
      const res = await GET(req, makeParams("item-1"));

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/jpeg");
      expect(res.headers.get("Cache-Control")).toBe("private, max-age=300");
    });
  });

  // ─── DELETE (remove) ──────────────────────────────────────────────

  describe("DELETE", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null as never);

      const req = new Request("http://localhost/api/catalogue/item-1/photo", {
        method: "DELETE",
      });
      const res = await DELETE(req, makeParams("item-1"));
      expect(res.status).toBe(401);
    });

    it("returns 404 when item does not exist or wrong tenant", async () => {
      vi.mocked(db.catalogueItem.findFirst).mockResolvedValue(null);

      const req = new Request("http://localhost/api/catalogue/item-1/photo", {
        method: "DELETE",
      });
      const res = await DELETE(req, makeParams("item-1"));
      expect(res.status).toBe(404);
    });

    it("sets mediaStorageKey to null", async () => {
      vi.mocked(db.catalogueItem.findFirst).mockResolvedValue(mockItemWithPhoto as never);
      vi.mocked(db.catalogueItem.update).mockResolvedValue({
        ...mockItemWithPhoto,
        mediaStorageKey: null,
      } as never);

      const req = new Request("http://localhost/api/catalogue/item-1/photo", {
        method: "DELETE",
      });
      const res = await DELETE(req, makeParams("item-1"));

      expect(res.status).toBe(200);
      expect(db.catalogueItem.update).toHaveBeenCalledWith({
        where: { id: "item-1" },
        data: { mediaStorageKey: null },
      });
    });
  });
});
