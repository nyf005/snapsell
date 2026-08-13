import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTenantFindUnique = vi.hoisted(() => vi.fn());
const mockTenantUpdateMany = vi.hoisted(() => vi.fn());
const mockBossSend = vi.hoisted(() => vi.fn());
const mockEnsureBossReady = vi.hoisted(() => vi.fn());
const mockStartSync = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    tenant: {
      findUnique: mockTenantFindUnique,
      updateMany: mockTenantUpdateMany,
    },
  },
}));

vi.mock("~/server/workers/queues", () => ({
  boss: { send: mockBossSend },
  ensureBossReady: mockEnsureBossReady,
  QUEUE: { COEXISTENCE_SYNC: "coexistence-sync" },
}));

vi.mock("~/lib/crypto", () => ({ decrypt: () => "plain-token" }));
vi.mock("~/lib/logger", () => ({
  workerLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("~/server/messaging/providers/meta/embedded-signup", () => ({
  startCoexistenceSync: mockStartSync,
}));

import {
  enqueueCoexistenceSyncRequest,
  processCoexistenceSyncRequest,
} from "./coexistence-sync-request";

describe("coexistence sync request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureBossReady.mockResolvedValue(undefined);
    mockBossSend.mockResolvedValue("job-1");
    mockTenantUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("met la demande en file avec un payload discrimine", async () => {
    await enqueueCoexistenceSyncRequest({ tenantId: "tenant-1", correlationId: "corr-1" });

    expect(mockBossSend).toHaveBeenCalledWith("coexistence-sync", {
      kind: "request",
      tenantId: "tenant-1",
      correlationId: "corr-1",
    });
  });

  it("refuse une mise en file sans identifiant de job", async () => {
    mockBossSend.mockResolvedValue(null);

    await expect(
      enqueueCoexistenceSyncRequest({ tenantId: "tenant-1", correlationId: "corr-1" }),
    ).rejects.toThrow(/pas été mise en file/);
  });

  it("demande les deux synchronisations et preserve les etats termines", async () => {
    mockTenantFindUnique.mockResolvedValue({
      metaPhoneNumberId: "phone-1",
      metaAccessToken: "encrypted-token",
      metaHistorySyncAt: new Date(),
    });
    mockStartSync.mockResolvedValue({ history: "requested", contacts: "requested" });

    await processCoexistenceSyncRequest({
      kind: "request",
      tenantId: "tenant-1",
      correlationId: "corr-1",
    });

    expect(mockStartSync).toHaveBeenCalledWith({
      phoneNumberId: "phone-1",
      accessToken: "plain-token",
    });
    expect(mockTenantUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { metaContactsSyncStatus: null },
            { metaContactsSyncStatus: { in: ["requested"] } },
          ],
        }),
      }),
    );
    expect(mockTenantUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { metaHistorySyncStatus: null },
            { metaHistorySyncStatus: { in: ["requested"] } },
          ],
        }),
      }),
    );
  });
});
