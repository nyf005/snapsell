import { PrismaClientKnownRequestError } from "../../../generated/prisma";
import { db } from "~/server/db";
import { LiveSessionStatus } from "../../../generated/prisma";
import { getInactivityWindowMinutes } from "./config";

const MAX_RETRY_ON_CONFLICT = 1;

/**
 * Retourne la session active du tenant si last_activity_at > now - INACTIVITY_WINDOW ;
 * sinon crée une nouvelle LiveSession (status active) et la retourne.
 * Met à jour last_activity_at à now lors de l'utilisation.
 *
 * Garantie (Story 2.6 durci) : une seule session active par tenant. Contrainte unique
 * partielle en base (live_sessions_tenant_id_active_key) ; en cas de création concurrente,
 * un seul create réussit, l'autre reçoit P2002 et reprend la session créée (retry).
 */
export async function getOrCreateCurrentSession(
  tenantId: string,
  isRetryAfterConflict = false,
): Promise<{
  id: string;
  status: LiveSessionStatus;
  lastActivityAt: Date;
  created: boolean;
}> {
  const windowMinutes = getInactivityWindowMinutes();
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);

  const existing = await db.liveSession.findFirst({
    where: {
      tenantId,
      status: LiveSessionStatus.active,
      lastActivityAt: { gt: cutoff },
    },
    orderBy: { lastActivityAt: "desc" },
  });

  if (existing) {
    const updated = await db.liveSession.update({
      where: { id: existing.id },
      data: { lastActivityAt: new Date() },
    });
    return {
      id: updated.id,
      status: updated.status,
      lastActivityAt: updated.lastActivityAt,
      created: false,
    };
  }

  try {
    const created = await db.liveSession.create({
      data: {
        tenantId,
        status: LiveSessionStatus.active,
        lastActivityAt: new Date(),
      },
    });
    return {
      id: created.id,
      status: created.status,
      lastActivityAt: created.lastActivityAt,
      created: true,
    };
  } catch (error) {
    const isUniqueViolation =
      error instanceof PrismaClientKnownRequestError && error.code === "P2002";
    if (isUniqueViolation && !isRetryAfterConflict && MAX_RETRY_ON_CONFLICT > 0) {
      return getOrCreateCurrentSession(tenantId, true);
    }
    throw error;
  }
}

/**
 * Met à jour last_activity_at = now pour la session donnée.
 * Réservé aux appelants qui disposent déjà d'un sessionId (ex. Epic 3).
 * Le webhook-processor utilise getOrCreateCurrentSession, qui met déjà à jour
 * last_activity_at (création ou réutilisation), donc n'appelle pas cette fonction.
 */
export async function updateLastActivity(sessionId: string): Promise<void> {
  await db.liveSession.update({
    where: { id: sessionId },
    data: { lastActivityAt: new Date() },
  });
}
