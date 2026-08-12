import { beforeEach, describe, expect, it, vi } from "vitest";

const mockHandleEchoes = vi.hoisted(() => vi.fn().mockResolvedValue(1));
const mockHandleContacts = vi.hoisted(() => vi.fn().mockResolvedValue(2));
const mockHandleHistory = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ imported: 3, progress: "50" }),
);
const mockLoggerWarn = vi.hoisted(() => vi.fn());

vi.mock("~/server/messaging/providers/meta/coexistence-handlers", () => ({
  handleMessageEchoes: mockHandleEchoes,
  handleAppStateSync: mockHandleContacts,
  handleHistory: mockHandleHistory,
}));

vi.mock("~/server/workers/queues", () => ({
  boss: { work: vi.fn(), send: vi.fn() },
  QUEUE: { COEXISTENCE_SYNC: "coexistence-sync" },
}));

vi.mock("~/lib/logger", () => ({
  workerLogger: { info: vi.fn(), warn: mockLoggerWarn, error: vi.fn(), debug: vi.fn() },
}));

vi.mock("~/lib/sentry", () => ({ captureException: vi.fn() }));

import { processCoexistenceSyncJob } from "./coexistence-sync";

const base = { tenantId: "tenant-1", value: {}, correlationId: "corr-1" };

describe("processCoexistenceSyncJob", () => {
  beforeEach(() => vi.clearAllMocks());

  it("route un echo vers son handler", async () => {
    await processCoexistenceSyncJob({ ...base, field: "smb_message_echoes" });

    expect(mockHandleEchoes).toHaveBeenCalledTimes(1);
    expect(mockHandleContacts).not.toHaveBeenCalled();
    expect(mockHandleHistory).not.toHaveBeenCalled();
  });

  it("route les contacts vers leur handler", async () => {
    await processCoexistenceSyncJob({ ...base, field: "smb_app_state_sync" });

    expect(mockHandleContacts).toHaveBeenCalledTimes(1);
  });

  it("route l'historique vers son handler", async () => {
    await processCoexistenceSyncJob({ ...base, field: "history" });

    expect(mockHandleHistory).toHaveBeenCalledTimes(1);
  });

  /**
   * La route peut enfiler un champ que ce worker ne connaît pas encore. Échouer
   * ferait rejouer le job indéfiniment pour rien : on le signale et on s'arrête.
   */
  it("signale un champ sans traitement au lieu d'echouer", async () => {
    await expect(
      processCoexistenceSyncJob({ ...base, field: "champ_inconnu" }),
    ).resolves.toBeUndefined();

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "Coexistence: champ sans traitement",
      expect.objectContaining({ field: "champ_inconnu" }),
    );
  });

  it("laisse remonter l'echec d'un handler pour que pg-boss rejoue", async () => {
    mockHandleHistory.mockRejectedValueOnce(new Error("base indisponible"));

    await expect(
      processCoexistenceSyncJob({ ...base, field: "history" }),
    ).rejects.toThrow("base indisponible");
  });
});
