import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetSignedUrl } = vi.hoisted(() => ({
  mockGetSignedUrl: vi.fn(),
}));

// Mock r2-client
vi.mock("./r2-client", () => ({
  isR2Configured: vi.fn(),
  createR2Client: vi.fn(),
  getR2BucketName: vi.fn().mockReturnValue("test-bucket"),
}));

// Mock @aws-sdk/client-s3
vi.mock("@aws-sdk/client-s3", () => ({
  GetObjectCommand: class GetObjectCommand {
    input: unknown;
    constructor(input: unknown) { this.input = input; }
  },
}));

// Mock @aws-sdk/s3-request-presigner
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mockGetSignedUrl,
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

import { generateSignedR2Url } from "./r2-signed-url";
import { isR2Configured, createR2Client } from "./r2-client";

describe("r2-signed-url", () => {
  const correlationId = "corr-test-123";
  const storageKey = "tenants/t1/catalogue-items/ci1/photo";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return signed URL when R2 is configured and generation succeeds", async () => {
    vi.mocked(isR2Configured).mockReturnValue(true);
    const mockClient = {};
    vi.mocked(createR2Client).mockReturnValue(mockClient as never);
    mockGetSignedUrl.mockResolvedValue("https://r2.example.com/signed-url");

    const result = await generateSignedR2Url(storageKey, correlationId);

    expect(result).toBe("https://r2.example.com/signed-url");
    expect(isR2Configured).toHaveBeenCalled();
    expect(createR2Client).toHaveBeenCalled();
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        input: { Bucket: "test-bucket", Key: storageKey },
      }),
      { expiresIn: 3600 },
    );
  });

  it("should return null when R2 is not configured", async () => {
    vi.mocked(isR2Configured).mockReturnValue(false);

    const result = await generateSignedR2Url(storageKey, correlationId);

    expect(result).toBeNull();
    expect(createR2Client).not.toHaveBeenCalled();
    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it("should return null and log error when SDK throws", async () => {
    vi.mocked(isR2Configured).mockReturnValue(true);
    vi.mocked(createR2Client).mockReturnValue({} as never);
    mockGetSignedUrl.mockRejectedValue(new Error("SDK error"));

    const result = await generateSignedR2Url(storageKey, correlationId);

    expect(result).toBeNull();
    const { workerLogger } = await import("~/lib/logger");
    expect(workerLogger.error).toHaveBeenCalledWith(
      "Error generating signed R2 URL",
      expect.any(Error),
      expect.objectContaining({ correlationId, storageKey }),
    );
  });
});
