import { decrypt } from "~/lib/crypto";
import { workerLogger } from "~/lib/logger";
import { db } from "~/server/db";
import { boss, ensureBossReady, QUEUE } from "~/server/workers/queues";
import {
  startCoexistenceSync,
  type CoexistenceSyncResult,
} from "~/server/messaging/providers/meta/embedded-signup";

export const HISTORY_SYNC_WINDOW_MS = 24 * 60 * 60 * 1_000;

export type CoexistenceSyncRequestPayload = {
  kind: "request";
  tenantId: string;
  correlationId: string;
};

/**
 * Place la demande Meta dans la même file durable que ses réponses webhook.
 * La connexion n'est ainsi plus tributaire de la durée de vie d'une requête
 * Vercel après l'écriture des identifiants en base.
 */
export async function enqueueCoexistenceSyncRequest(params: {
  tenantId: string;
  correlationId: string;
}): Promise<void> {
  await ensureBossReady();
  const jobId = await boss.send(QUEUE.COEXISTENCE_SYNC, {
    kind: "request",
    tenantId: params.tenantId,
    correlationId: params.correlationId,
  } satisfies CoexistenceSyncRequestPayload);

  if (!jobId) {
    throw new Error("La demande de synchronisation Coexistence n'a pas été mise en file.");
  }
}

/** Préserve les états terminaux si un webhook a devancé la demande Meta. */
async function persistSyncResult(
  tenantId: string,
  result: CoexistenceSyncResult,
): Promise<void> {
  const contactPreviousStates =
    result.contacts === "requested" ? ["requested"] : ["requested", "failed"];
  await db.tenant.updateMany({
    where: {
      id: tenantId,
      OR: [
        { metaContactsSyncStatus: null },
        { metaContactsSyncStatus: { in: contactPreviousStates } },
      ],
    },
    data: { metaContactsSyncStatus: result.contacts },
  });

  const historyPreviousStates =
    result.history === "requested"
      ? ["requested"]
      : result.history === "declined"
        ? ["requested", "failed", "declined"]
        : ["requested", "failed"];
  await db.tenant.updateMany({
    where: {
      id: tenantId,
      OR: [
        { metaHistorySyncStatus: null },
        { metaHistorySyncStatus: { in: historyPreviousStates } },
      ],
    },
    data: { metaHistorySyncStatus: result.history },
  });
}

/** Exécuté par pg-boss : lit toujours les identifiants validés et chiffrés. */
export async function processCoexistenceSyncRequest(
  payload: CoexistenceSyncRequestPayload,
): Promise<void> {
  const tenant = await db.tenant.findUnique({
    where: { id: payload.tenantId },
    select: {
      metaPhoneNumberId: true,
      metaAccessToken: true,
      metaHistorySyncAt: true,
    },
  });

  if (!tenant?.metaPhoneNumberId || !tenant.metaAccessToken || !tenant.metaHistorySyncAt) {
    throw new Error("Configuration Coexistence incomplète pour lancer la synchronisation.");
  }

  if (Date.now() - tenant.metaHistorySyncAt.getTime() > HISTORY_SYNC_WINDOW_MS) {
    await db.tenant.updateMany({
      where: {
        id: payload.tenantId,
        OR: [
          { metaHistorySyncStatus: null },
          { metaHistorySyncStatus: { not: "completed" } },
        ],
      },
      data: { metaHistorySyncStatus: "failed" },
    });
    throw new Error("La fenêtre Meta de 24 heures est dépassée.");
  }

  const result = await startCoexistenceSync({
    phoneNumberId: tenant.metaPhoneNumberId,
    accessToken: decrypt(tenant.metaAccessToken),
  });
  await persistSyncResult(payload.tenantId, result);

  workerLogger.info("Meta: demandes de synchronisation Coexistence traitées", {
    tenantId: payload.tenantId,
    correlationId: payload.correlationId,
    historyStatus: result.history,
    contactsStatus: result.contacts,
  });
}
