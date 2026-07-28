/**
 * Cron : renouvellement mensuel des crédits + purge des fenêtres de conversation.
 *
 * Comble deux manques identifiés à l'audit du 2026-07-28 :
 *   1. `usageResetDate` était lu pour l'affichage mais aucun job ne le faisait avancer :
 *      `creditsBalance` ne se rechargeait jamais. Un vendeur épuisant ses crédits
 *      restait bloqué indéfiniment.
 *   2. `cleanupExpiredWindows()` existait mais n'était appelé nulle part :
 *      la table `conversation_windows` grossissait sans limite.
 *
 * Règles :
 *   - `creditsBalance` est remis au `creditsTotalMonthly` du plan **courant** du tenant.
 *   - `creditsBonus` (crédits achetés) n'est **jamais** réinitialisé : il est reporté.
 *   - `usageResetDate` avance d'un mois, `cycleStartedAt` est repositionné à maintenant.
 *   - `lowCreditsAlerted` est remis à false pour réarmer l'alerte du cycle suivant.
 */

import { getPlanConfig } from "~/lib/subscription-plans";
import { workerLogger } from "~/lib/logger";
import { db } from "~/server/db";
import { cleanupExpiredWindows } from "~/server/credits/service";

export type CreditsMonthlyResetRunResult = {
  tenantsReset: number;
  /** Tenants dont le cycle était non amorcé (`usageResetDate` null) et vient d'être initialisé. */
  tenantsInitialized: number;
  windowsPurged: number;
  timestamp: string;
};

/** Ajoute un mois calendaire à une date. */
function addOneMonth(date: Date): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + 1);
  return next;
}

export async function runCreditsMonthlyResetJob(): Promise<CreditsMonthlyResetRunResult> {
  const now = new Date();

  // 1. Purge des fenêtres de conversation échues (toutes tenants confondus).
  let windowsPurged = 0;
  try {
    windowsPurged = await cleanupExpiredWindows();
    if (windowsPurged > 0) {
      workerLogger.info(`[cron:credits-monthly-reset] Purged ${windowsPurged} expired conversation windows`);
    }
  } catch (error) {
    // La purge est du nettoyage : son échec ne doit pas empêcher le renouvellement des crédits.
    workerLogger.error("[cron:credits-monthly-reset] Window cleanup failed", error);
  }

  // 2. Tenants à traiter : échéance passée, ou cycle jamais amorcé.
  //
  //    `usageResetDate` est nullable et n'était historiquement positionné nulle part :
  //    tous les tenants créés avant le 2026-07-28 l'ont à null. On les amorce ici plutôt
  //    que par une migration de données, pour que le rattrapage soit idempotent.
  const dueTenants = await db.tenant.findMany({
    where: {
      OR: [{ usageResetDate: { lte: now } }, { usageResetDate: null }],
    },
    select: {
      id: true,
      subscriptionPlan: true,
      usageResetDate: true,
      cycleStartedAt: true,
      createdAt: true,
      creditsBalance: true,
    },
  });

  workerLogger.info(`[cron:credits-monthly-reset] ${dueTenants.length} tenant(s) to process`);

  let tenantsReset = 0;
  let tenantsInitialized = 0;

  for (const tenant of dueTenants) {
    // Cycle jamais amorcé : on déduit l'échéance depuis le début de cycle connu,
    // ou à défaut depuis la date de création du compte.
    if (!tenant.usageResetDate) {
      const nextReset = addOneMonth(tenant.cycleStartedAt ?? tenant.createdAt);

      if (nextReset > now) {
        // L'échéance déduite est dans le futur : on se contente d'amorcer la date.
        // Surtout ne pas recharger les crédits ici, ce serait offrir un cycle entier
        // à tous les tenants existants au premier passage du cron.
        await db.tenant.update({
          where: { id: tenant.id },
          data: { usageResetDate: nextReset },
        });
        tenantsInitialized += 1;
        workerLogger.info("[cron:credits-monthly-reset] Cycle initialized (no credit reset)", {
          tenantId: tenant.id,
          nextReset: nextReset.toISOString(),
        });
        continue;
      }
      // Sinon l'échéance déduite est déjà passée : on poursuit vers le renouvellement.
    }

    let creditsTotalMonthly: number;
    try {
      creditsTotalMonthly = getPlanConfig(tenant.subscriptionPlan).entitlements.creditsTotalMonthly;
    } catch {
      // Plan inconnu (donnée corrompue) : on saute ce tenant plutôt que de faire échouer tout le job.
      workerLogger.error("[cron:credits-monthly-reset] Unknown plan, skipping tenant", undefined, {
        tenantId: tenant.id,
        plan: tenant.subscriptionPlan,
      });
      continue;
    }

    // Repartir de la date d'échéance et non de `now`, pour ne pas dériver
    // si le job tourne avec du retard. On rattrape les cycles manqués.
    let nextReset = addOneMonth(
      tenant.usageResetDate ?? tenant.cycleStartedAt ?? tenant.createdAt,
    );
    while (nextReset <= now) {
      nextReset = addOneMonth(nextReset);
    }

    await db.tenant.update({
      where: { id: tenant.id },
      data: {
        creditsBalance: creditsTotalMonthly,
        creditsTotalMonthly,
        usageResetDate: nextReset,
        cycleStartedAt: now,
        lowCreditsAlerted: false,
      },
    });

    tenantsReset += 1;
    workerLogger.info("[cron:credits-monthly-reset] Credits renewed", {
      tenantId: tenant.id,
      plan: tenant.subscriptionPlan,
      previousBalance: tenant.creditsBalance,
      newBalance: creditsTotalMonthly,
      nextReset: nextReset.toISOString(),
    });
  }

  return {
    tenantsReset,
    tenantsInitialized,
    windowsPurged,
    timestamp: now.toISOString(),
  };
}
