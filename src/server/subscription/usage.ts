/**
 * Story 7A.2 — Comptage d'usage et quotas (preuves, agents).
 *
 * Compteurs = COUNT dynamique depuis le début du cycle. Pas de compteur stocké en dur.
 *
 * Note (2026-07-28) : la facturation au dépassement (`checkQuota`, `calculateOverage`,
 * `chargeOverage`, `QuotaExceededError`) a été supprimée. Elle calculait le dépassement
 * sur le nombre de **commandes** confirmées face à `maxConfirmedOrdersPerMonth` — un
 * quota porté à 999 999 sur tous les plans depuis que le modèle économique est passé
 * aux **crédits/sessions**. Elle n'aurait donc jamais rien facturé.
 *
 * Le dépassement pertinent est calculé sur la bonne dimension par `getUsageThisCycle`
 * (`overageCount = créditsUtilisés − creditsTotalMonthly`) mais n'est aujourd'hui
 * ni affiché ni prélevé. Facturer le dépassement demandera une décision produit
 * (quand prélever ? que faire en cas d'échec ?) et un calcul à réécrire sur les crédits.
 * `chargeAuthorization()` reste disponible dans `server/payment/paystack.ts`.
 */

import { db } from "~/server/db";

/**
 * Get the start of the current billing cycle for a tenant.
 * - Free: beginning of current calendar month
 * - Paid: cycleStartedAt from tenant record
 */
function getCycleStart(tenant: { cycleStartedAt: Date | null; subscriptionPlan: string }): Date {
  if (tenant.cycleStartedAt) {
    return tenant.cycleStartedAt;
  }
  // Free plan: beginning of current calendar month
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Count confirmed orders this cycle for a tenant.
 * Statuses counted: confirmed, confirmed_pending_deposit, preparing, in_delivery, delivered
 * Not counted: cancelled
 */
async function countConfirmedOrdersThisCycle(
  tenantId: string,
  cycleStart: Date,
): Promise<number> {
  return db.order.count({
    where: {
      tenantId,
      createdAt: { gte: cycleStart },
      status: {
        in: ["confirmed", "confirmed_pending_deposit", "preparing", "in_delivery", "delivered"],
      },
    },
  });
}

/**
 * Count credits used this cycle.
 * Credits are consumed when a new ConversationWindow is created (new session).
 * Uses ConversationWindow count as proxy for credits used.
 */
async function countCreditsUsedThisCycle(
  tenantId: string,
  cycleStart: Date,
  totalMonthly: number,
  currentBalance: number,
): Promise<number> {
  const windowsCreated = await db.conversationWindow.count({
    where: {
      tenantId,
      createdAt: { gte: cycleStart },
    },
  });

  const used = totalMonthly - currentBalance;
  return Math.max(used, windowsCreated);
}

/**
 * Count proofs submitted this cycle.
 */
async function countProofsThisCycle(
  tenantId: string,
  cycleStart: Date,
): Promise<number> {
  return db.paymentProof.count({
    where: {
      tenantId,
      createdAt: { gte: cycleStart },
    },
  });
}

/**
 * Count active agents (users with role AGENT) for a tenant.
 */
async function countActiveAgents(tenantId: string): Promise<number> {
  return db.user.count({
    where: {
      tenantId,
      role: "AGENT",
    },
  });
}

export interface UsageThisCycle {
  balance: number;
  totalMonthly: number;
  used: number;
  confirmedOrders: number;
  proofs: number;
  maxProofs: number;
  agents: number;
  maxAgents: number;
  overageCount: number;
  overageAmountFCFA: number;
  cycleStart: Date;
  plan: string;
}

/**
 * Get complete usage for this billing cycle.
 */
export async function getUsageThisCycle(tenantId: string): Promise<UsageThisCycle> {
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      subscriptionPlan: true,
      cycleStartedAt: true,
      creditsBalance: true,
      creditsTotalMonthly: true,
      maxProofsPerMonth: true,
      maxAgents: true,
      overagePerOrderCents: true,
    },
  });

  const cycleStart = getCycleStart(tenant);

  const [used, confirmedOrders, proofs, agents] = await Promise.all([
    countCreditsUsedThisCycle(tenantId, cycleStart, tenant.creditsTotalMonthly, tenant.creditsBalance),
    countConfirmedOrdersThisCycle(tenantId, cycleStart),
    countProofsThisCycle(tenantId, cycleStart),
    countActiveAgents(tenantId),
  ]);

  const overageCount = Math.max(0, used - tenant.creditsTotalMonthly);
  const overageAmountFCFA =
    tenant.overagePerOrderCents > 0
      ? Math.round((overageCount * tenant.overagePerOrderCents) / 100)
      : 0;

  return {
    balance: tenant.creditsBalance,
    totalMonthly: tenant.creditsTotalMonthly,
    used,
    confirmedOrders,
    proofs,
    maxProofs: tenant.maxProofsPerMonth,
    agents,
    maxAgents: tenant.maxAgents,
    overageCount,
    overageAmountFCFA,
    cycleStart,
    plan: tenant.subscriptionPlan,
  };
}

export type ProofsQuotaCheckResult = {
  allowed: boolean;
  currentUsage: number;
  quota: number; // -1 means unlimited
};

export type AgentsQuotaCheckResult = {
  allowed: boolean;
  currentCount: number;
  maxAgents: number;
};

/**
 * Check if a tenant can create another payment proof this cycle.
 * - quota === -1 (unlimited): always allowed
 * - currentUsage >= quota: not allowed
 */
export async function checkProofsQuota(tenantId: string): Promise<ProofsQuotaCheckResult> {
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { maxProofsPerMonth: true, cycleStartedAt: true, subscriptionPlan: true },
  });
  const cycleStart = getCycleStart(tenant);
  const currentUsage = await countProofsThisCycle(tenantId, cycleStart);
  const quota = tenant.maxProofsPerMonth;
  if (quota === -1) {
    return { allowed: true, currentUsage, quota: -1 };
  }
  return {
    allowed: currentUsage < quota,
    currentUsage,
    quota,
  };
}

/**
 * Check if a tenant can add another agent (invitation or accept).
 * - currentCount >= maxAgents: not allowed
 */
export async function checkAgentsQuota(tenantId: string): Promise<AgentsQuotaCheckResult> {
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { maxAgents: true },
  });
  const currentCount = await countActiveAgents(tenantId);
  return {
    allowed: currentCount < tenant.maxAgents,
    currentCount,
    maxAgents: tenant.maxAgents,
  };
}
