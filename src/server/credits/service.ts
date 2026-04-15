/**
 * Service de gestion des credits (sessions client)
 * 1 credit = 1 session de 24h avec un client unique
 *
 * Ordre de consommation : creditsBalance (mensuel) en premier, puis creditsBonus (achetés).
 */

import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";

const CONVERSATION_WINDOW_HOURS = 24;

export type CheckCreditsResult =
  | { allowed: true; isNewSession: boolean }
  | { allowed: false; reason: "no_credits" };

/**
 * Vérifie et consume un credit pour une nouvelle session client.
 * Retourne true si le client peut start une nouvelle session.
 * Une session existante (non expirée) ne consomme pas de credit.
 */
export async function checkAndConsumeCredit(
  tenantId: string,
  customerPhone: string,
): Promise<CheckCreditsResult> {
  // 1. Check si une session active existe déjà
  const existingWindow = await db.conversationWindow.findFirst({
    where: {
      tenantId,
      customerPhone,
      expiresAt: { gt: new Date() },
    },
  });

  if (existingWindow) {
    workerLogger.debug("Session already active, no credit consumed", {
      tenantId,
      customerPhone,
      windowId: existingWindow.id,
    });
    return { allowed: true, isNewSession: false };
  }

  // 2. Pas de session active — vérifier les credits (mensuel + bonus)
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      creditsBalance: true,
      creditsBonus: true,
      subscriptionPlan: true,
    },
  });

  if (!tenant) {
    workerLogger.error("Tenant not found", { tenantId });
    return { allowed: false, reason: "no_credits" };
  }

  const totalAvailable = tenant.creditsBalance + tenant.creditsBonus;

  if (totalAvailable <= 0) {
    workerLogger.warn("No credits remaining, blocking new session", {
      tenantId,
      customerPhone,
      creditsBalance: tenant.creditsBalance,
      creditsBonus: tenant.creditsBonus,
      plan: tenant.subscriptionPlan,
    });
    return { allowed: false, reason: "no_credits" };
  }

  // 3. Consommer 1 credit : d'abord mensuel, puis bonus
  const expiresAt = new Date(Date.now() + CONVERSATION_WINDOW_HOURS * 60 * 60 * 1000);

  const deductFromBalance = tenant.creditsBalance > 0;

  await db.$transaction([
    db.tenant.update({
      where: { id: tenantId },
      data: deductFromBalance
        ? { creditsBalance: { decrement: 1 } }
        : { creditsBonus: { decrement: 1 } },
    }),
    db.conversationWindow.create({
      data: { tenantId, customerPhone, expiresAt },
    }),
  ]);

  workerLogger.info("New session created, credit consumed", {
    tenantId,
    customerPhone,
    source: deductFromBalance ? "balance" : "bonus",
    creditsRemaining: totalAvailable - 1,
    expiresAt,
  });

  return { allowed: true, isNewSession: true };
}

/**
 * Nettoie les sessions expirées (callable par cron job)
 */
export async function cleanupExpiredWindows(tenantId?: string): Promise<number> {
  const where = tenantId
    ? { tenantId, expiresAt: { lte: new Date() } }
    : { expiresAt: { lte: new Date() } };

  const result = await db.conversationWindow.deleteMany({ where });
  return result.count;
}
