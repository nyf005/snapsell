import { boss, QUEUE } from "~/server/workers/queues";
import { workerLogger } from "~/lib/logger";
import { captureException } from "~/lib/sentry";
import {
  handleAppStateSync,
  handleHistory,
  handleMessageEchoes,
} from "~/server/messaging/providers/meta/coexistence-handlers";
import { META_WEBHOOK_FIELDS } from "~/server/messaging/providers/meta/webhook-fields";

/**
 * ── L'IMPORT NE SE FAIT PAS DANS LA REQUÊTE WEBHOOK ────────────────────────
 *
 * Il l'était : chaque contact et chaque message d'historique produisait une
 * requête SQL, en série, pendant que Meta attendait sa réponse. Un historique
 * de six mois représente des milliers de messages — la réponse dépassait
 * largement la seconde visée, Meta rejouait le lot, et le rejeu relançait le
 * même import. Une boutique un peu ancienne pouvait à elle seule saturer la
 * route.
 *
 * La route se contente désormais d'enfiler le payload et de répondre `200`.
 * L'import se fait ici, où il peut durer et être réessayé sans que Meta ne
 * s'impatiente.
 * ────────────────────────────────────────────────────────────────────────────
 */
export type CoexistenceSyncPayload = {
  tenantId: string;
  field: string;
  value: Record<string, unknown>;
  correlationId: string;
};

export async function processCoexistenceSyncJob(payload: CoexistenceSyncPayload): Promise<void> {
  const { tenantId, field, value, correlationId } = payload;

  if (field === META_WEBHOOK_FIELDS.MESSAGE_ECHOES) {
    const written = await handleMessageEchoes({ tenantId, value, correlationId });
    workerLogger.info("Coexistence: échos enregistrés", { correlationId, tenantId, count: written });
    return;
  }

  if (field === META_WEBHOOK_FIELDS.APP_STATE_SYNC) {
    const applied = await handleAppStateSync({ tenantId, value, correlationId });
    workerLogger.info("Coexistence: contacts synchronisés", { correlationId, tenantId, count: applied });
    return;
  }

  if (field === META_WEBHOOK_FIELDS.HISTORY) {
    const { imported, progress } = await handleHistory({ tenantId, value, correlationId });
    workerLogger.info("Coexistence: historique importé", {
      correlationId,
      tenantId,
      count: imported,
      progress: progress ?? "",
    });
    return;
  }

  // Un champ non traité n'est pas une erreur : la route en enfile un jour de
  // plus que ce que ce worker connaît, on le dit plutôt que d'échouer.
  workerLogger.warn("Coexistence: champ sans traitement", { correlationId, tenantId, field });
}

export async function startCoexistenceSyncWorker(): Promise<string> {
  workerLogger.info("Coexistence sync worker started", {
    queueName: QUEUE.COEXISTENCE_SYNC,
    concurrency: 2,
  });
  return boss.work<CoexistenceSyncPayload>(
    QUEUE.COEXISTENCE_SYNC,
    /*
      Concurrence basse à dessein : ces jobs écrivent beaucoup, et rien ne presse.
      Les messages entrants des clientes passent par une autre file, qui garde
      donc sa réactivité pendant un gros import.
    */
    { localConcurrency: 2, batchSize: 1 },
    async (jobs) => {
      const job = jobs[0]!;
      try {
        await processCoexistenceSyncJob(job.data);
      } catch (error) {
        void captureException(error instanceof Error ? error : new Error(String(error)), {
          correlationId: job.data.correlationId,
          tags: { component: "coexistence-sync" },
        });
        throw error;
      }
    },
  );
}
