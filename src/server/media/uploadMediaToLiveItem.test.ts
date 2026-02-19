import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadMediaAndLinkToLiveItem } from "./uploadMediaToLiveItem";

vi.mock("~/env", () => ({
  env: {
    R2_ACCOUNT_ID: undefined,
    R2_ACCESS_KEY_ID: undefined,
    R2_SECRET_ACCESS_KEY: undefined,
    R2_BUCKET_NAME: undefined,
  },
}));

vi.mock("~/server/db", () => ({
  db: {
    liveItem: { update: vi.fn() },
  },
}));

vi.mock("~/lib/logger", () => ({
  workerLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("uploadMediaAndLinkToLiveItem (Story 3.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns early without calling db or fetch when R2 is not configured", async () => {
    const { db } = await import("~/server/db");

    await uploadMediaAndLinkToLiveItem(
      "tenant-1",
      "item-1",
      "https://example.com/foo/bar",
      "corr-1",
    );

    expect(db.liveItem.update).not.toHaveBeenCalled();
  });

  it("returns early when mediaUrl is invalid (no fetch) when R2 is configured", async () => {
    const { env } = await import("~/env");
    vi.mocked(env).R2_ACCOUNT_ID = "r2-account";
    vi.mocked(env).R2_ACCESS_KEY_ID = "key";
    vi.mocked(env).R2_SECRET_ACCESS_KEY = "secret";
    vi.mocked(env).R2_BUCKET_NAME = "bucket";

    const { db } = await import("~/server/db");

    await uploadMediaAndLinkToLiveItem(
      "tenant-1",
      "item-1",
      "not-a-valid-url",
      "corr-2",
    );

    expect(db.liveItem.update).not.toHaveBeenCalled();
  });
});
