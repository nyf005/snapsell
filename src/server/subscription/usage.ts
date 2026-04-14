/**
 * Story 7A.2 — AC #12, #13, #14: Usage counting, quota check, overage calculation.
 *
 * Compteur usage = COUNT dynamique des commandes confirmées depuis début du cycle.
 * Pas de compteur stocké en dur — recalculé à chaque appel.
 */

import { db } from "~/server/db";
import { chargeAuthorization } from "~/server/payment/paystack";
import { workerLogger } from "~/lib/logger";

/** Status enum pour le résultat du quota check */
export type QuotaCheckResult = {
  allowed: boolean;
  isOverage: boolean;
  currentUsage: number;
  quota: number;
  overageCount: number;
  plan: string;
};

/**
 * Custom error for quota exceeded (Free plan blocking).
 */
export class QuotaExceededError extends Error {
  constructor(
    public readonly tenantId: string,
    public readonly quota: QuotaCheckResult,
  ) {
    super(`Quota exceeded for tenant ${tenantId}: ${quota.currentUsage}/${quota.quota}`);
    this.name = "QuotaExceededError";
  }
}

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

  const [used, confirmedOrders, agents] = await Promise.all([
    countCreditsUsedThisCycle(tenantId, cycleStart, tenant.creditsTotalMonthly, tenant.creditsBalance),
    countConfirmedOrdersThisCycle(tenantId, cycleStart),
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

/**
 * Check if a tenant can confirm another order.
 * - Free: blocked at quota (allowed=false)
 * - Starter/Pro: allowed with overage tracking
 */
export async function checkQuota(tenantId: string): Promise<QuotaCheckResult> {
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      subscriptionPlan: true,
      cycleStartedAt: true,
      maxConfirmedOrdersPerMonth: true,
      overagePerOrderCents: true,
    },
  });

  const cycleStart = getCycleStart(tenant);
  const currentUsage = await countConfirmedOrdersThisCycle(tenantId, cycleStart);
  const quota = tenant.maxConfirmedOrdersPerMonth;
  const isOverQuota = currentUsage >= quota;

  // Free plan: block at quota
  if (tenant.subscriptionPlan === "free" && isOverQuota) {
    return {
      allowed: false,
      isOverage: false,
      currentUsage,
      quota,
      overageCount: 0,
      plan: tenant.subscriptionPlan,
    };
  }

  // Paid plans: allow with overage
  const overageCount = isOverQuota ? currentUsage - quota + 1 : 0; // +1 for the order about to be created

  return {
    allowed: true,
    isOverage: isOverQuota,
    currentUsage,
    quota,
    overageCount,
    plan: tenant.subscriptionPlan,
  };
}

/**
 * Calculate total overage amount for current cycle.
 */
export async function calculateOverage(
  tenantId: string,
): Promise<{ overageCount: number; ratePerOrder: number; totalAmountFCFA: number }> {
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      subscriptionPlan: true,
      cycleStartedAt: true,
      maxConfirmedOrdersPerMonth: true,
      overagePerOrderCents: true,
    },
  });

  const cycleStart = getCycleStart(tenant);
  const confirmedOrders = await countConfirmedOrdersThisCycle(tenantId, cycleStart);
  const overageCount = Math.max(0, confirmedOrders - tenant.maxConfirmedOrdersPerMonth);

  if (overageCount === 0 || tenant.overagePerOrderCents === 0) {
    return { overageCount: 0, ratePerOrder: 0, totalAmountFCFA: 0 };
  }

  const ratePerOrder = Math.round(tenant.overagePerOrderCents / 100);
  const totalAmountFCFA = overageCount * ratePerOrder;

  return { overageCount, ratePerOrder, totalAmountFCFA };
}

/**
 * Charge accumulated overage via Paystack authorization.
 * Called at renewal (webhook charge.success).
 */
export async function chargeOverage(tenantId: string): Promise<boolean> {
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      paystackAuthorizationCode: true,
      subscriptionPlan: true,
      cycleStartedAt: true,
      maxConfirmedOrdersPerMonth: true,
      overagePerOrderCents: true,
      users: {
        where: { role: "OWNER" },
        select: { email: true },
        take: 1,
      },
    },
  });

  if (!tenant.paystackAuthorizationCode) {
    workerLogger.warn("chargeOverage: no authorization code", { tenantId });
    return false;
  }

  const overage = await calculateOverage(tenantId);
  if (overage.totalAmountFCFA === 0) {
    return true; // No overage to charge
  }

  const email = tenant.users[0]?.email;
  if (!email) {
    workerLogger.warn("chargeOverage: no owner email found", { tenantId });
    return false;
  }

  try {
    const result = await chargeAuthorization(
      tenant.paystackAuthorizationCode,
      email,
      overage.totalAmountFCFA * 100, // Convert FCFA to kobo
    );

    // Record overage payment
    await db.subscriptionPayment.create({
      data: {
        tenantId,
        paystackReference: result.data.reference,
        type: "overage",
        plan: tenant.subscriptionPlan,
        amount: overage.totalAmountFCFA,
        status: result.data.status === "success" ? "success" : "failed",
        overageDetails: {
          ordersOverQuota: overage.overageCount,
          ratePerOrder: overage.ratePerOrder,
          totalAmount: overage.totalAmountFCFA,
        },
      },
    });

    return result.data.status === "success";
  } catch (error) {
    workerLogger.warn("chargeOverage: Paystack charge failed", { tenantId, error });
    return false;
  }
}
