import { SUBSCRIPTION_PLANS } from "~/lib/subscription-plans";
import { workerLogger } from "~/lib/logger";
import { db } from "~/server/db";

export type SubscriptionExpiredRunResult = {
  processed: number;
  timestamp: string;
};

export async function runSubscriptionExpiredJob(): Promise<SubscriptionExpiredRunResult> {
  const now = new Date();

  const expiredTenants = await db.tenant.findMany({
    where: {
      subscriptionPlan: { not: "free" },
      subscriptionExpiresAt: { lt: now },
      subscriptionStatus: { in: ["active", "non_renewing"] },
    },
    select: { id: true, subscriptionPlan: true },
  });

  workerLogger.info(`[cron:subscription-expired] Checking ${expiredTenants.length} expired subscriptions`);

  for (const tenant of expiredTenants) {
    const freePlan = SUBSCRIPTION_PLANS.free;
    await db.tenant.update({
      where: { id: tenant.id },
      data: {
        subscriptionStatus: "cancelled",
        subscriptionPlan: "free",
        creditsBalance: freePlan.entitlements.creditsTotalMonthly,
        creditsTotalMonthly: freePlan.entitlements.creditsTotalMonthly,
        maxAgents: freePlan.entitlements.maxAgents,
        maxProofsPerMonth: freePlan.entitlements.maxProofsPerMonth,
        overagePerOrderCents: freePlan.entitlements.overagePerOrderCents,
        hasExportCsv: freePlan.entitlements.hasExportCsv,
        hasAdvancedExports: freePlan.entitlements.hasAdvancedExports,
        hasNotificationsOutside24h: freePlan.entitlements.hasNotificationsOutside24h,
        hasDepositRecommended: false,
        hasAdvancedFilters: freePlan.entitlements.hasAdvancedFilters,
        hasPrioritySupport: freePlan.entitlements.hasPrioritySupport,
        hasAI: freePlan.entitlements.hasAI,
        showBranding: freePlan.entitlements.showBranding,
        showUpgradeBanner: true,
      },
    });
    workerLogger.info(`[cron:subscription-expired] Downgraded tenant ${tenant.id} from ${tenant.subscriptionPlan} to Free`);
  }

  return {
    processed: expiredTenants.length,
    timestamp: now.toISOString(),
  };
}
