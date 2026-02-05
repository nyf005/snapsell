/**
 * Worker / job périodique : fermeture des sessions live inactives (Story 2.6)
 *
 * Sélectionne les LiveSession où status = active ET last_activity_at < now - INACTIVITY_WINDOW,
 * met status = closed, et log event live_session.closed dans EventLog.
 * Architecture §11.2 : Cron clôture live session auto sur Railway.
 */

import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";
import { LiveSessionStatus } from "../../../generated/prisma";
import { getInactivityWindowMinutes } from "~/server/live-session/config";
import { logLiveSessionClosed } from "~/server/events/eventLog";

/** Nombre max de sessions fermées par run (évite surcharge en forte charge). */
const CLOSE_BATCH_LIMIT = 100;

/**
 * Exécute une passe de fermeture des sessions inactives.
 * Idempotent : peut être appelé plusieurs fois. Traite au plus CLOSE_BATCH_LIMIT sessions par run.
 */
export async function runCloseInactiveLiveSessions(): Promise<{
  closedCount: number;
  closedIds: string[];
}> {
  const windowMinutes = getInactivityWindowMinutes();
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);

  const toClose = await db.liveSession.findMany({
    where: {
      status: LiveSessionStatus.active,
      lastActivityAt: { lt: cutoff },
    },
    select: { id: true, tenantId: true },
    take: CLOSE_BATCH_LIMIT,
    orderBy: { lastActivityAt: "asc" }, // plus anciennes en premier
  });

  const closedIds: string[] = [];

  for (const session of toClose) {
    try {
      await db.liveSession.update({
        where: { id: session.id },
        data: { status: LiveSessionStatus.closed },
      });
      closedIds.push(session.id);
      // correlationId pour audit : on utilise l'id de session car pas de message associé
      await logLiveSessionClosed(
        session.tenantId,
        session.id,
        `live-session-${session.id}`,
      ).catch((err) => {
        workerLogger.error("Error logging live_session_closed", err, {
          tenantId: session.tenantId,
          liveSessionId: session.id,
        });
      });
      workerLogger.info("Live session closed (inactivity)", {
        liveSessionId: session.id,
        tenantId: session.tenantId,
      });
    } catch (error) {
      workerLogger.error("Error closing live session", error, {
        liveSessionId: session.id,
        tenantId: session.tenantId,
      });
      // Continue avec les autres
    }
  }

  if (toClose.length > 0) {
    workerLogger.info("Close inactive live sessions run completed", {
      closedCount: closedIds.length,
      totalCandidates: toClose.length,
      cutoff: cutoff.toISOString(),
      windowMinutes,
    });
  }

  return { closedCount: closedIds.length, closedIds };
}

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Démarre le worker périodique de fermeture des sessions inactives.
 * @param intervalMs - Intervalle en ms (défaut 10 min)
 * @returns Référence à l'interval pour arrêt propre (clearInterval)
 */
export function startCloseInactiveLiveSessionsWorker(
  intervalMs: number = DEFAULT_INTERVAL_MS,
): NodeJS.Timeout {
  workerLogger.info("Starting close-inactive-live-sessions worker", {
    intervalMs,
    intervalMinutes: Math.round(intervalMs / 60000),
  });

  const run = () => {
    void runCloseInactiveLiveSessions();
  };

  run(); // Premier run au démarrage
  return setInterval(run, intervalMs);
}

/**
 * Arrête le worker (clear l'interval).
 */
export function stopCloseInactiveLiveSessionsWorker(intervalId: NodeJS.Timeout): void {
  clearInterval(intervalId);
  workerLogger.info("Close-inactive-live-sessions worker stopped");
}
