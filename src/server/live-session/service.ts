import { LiveSessionStatus, Prisma } from "../../../generated/prisma";
import { db } from "~/server/db";
import { getInactivityWindowMinutes } from "./config";

const MAX_RETRY_ON_CONFLICT = 1;

/**
 * Story 8.3: Retourne les critères de filtrage d'une session active.
 * Centralise la logique de fenêtre d'inactivité (DRY).
 */
function getActiveSessionWhere(tenantId: string): Prisma.LiveSessionWhereInput {
  const windowMinutes = getInactivityWindowMinutes();
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);

  return {
    tenantId,
    status: LiveSessionStatus.active,
    lastActivityAt: { gt: cutoff },
  };
}

/**
 * Story 6.4: Retourne la session live active du tenant (lecture seule, sans création).
 */
export async function getCurrentSessionReadOnly(tenantId: string): Promise<{
  id: string;
  status: LiveSessionStatus;
  lastActivityAt: Date;
  createdAt: Date;
} | null> {
  return db.liveSession.findFirst({
    where: getActiveSessionWhere(tenantId),
    orderBy: { lastActivityAt: "desc" },
    select: { id: true, status: true, lastActivityAt: true, createdAt: true },
  });
}

/**
 * Retourne la session active du tenant si elle respecte la fenêtre d'inactivité ;
 * sinon crée une nouvelle LiveSession (status active) et la retourne.
 * Met à jour last_activity_at à now lors de l'utilisation.
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
  const existing = await db.liveSession.findFirst({
    where: getActiveSessionWhere(tenantId),
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
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (isUniqueViolation && !isRetryAfterConflict && MAX_RETRY_ON_CONFLICT > 0) {
      return getOrCreateCurrentSession(tenantId, true);
    }
    throw error;
  }
}

/**
 * Met à jour last_activity_at = now pour la session donnée.
 */
export async function updateLastActivity(sessionId: string): Promise<void> {
  await db.liveSession.update({
    where: { id: sessionId },
    data: { lastActivityAt: new Date() },
  });
}
