/**
 * Story 7A.2 — AC #4, #9, #10, #12: Router tRPC subscription
 *
 * Procedures:
 * - getSubscription — plan, statut, nextPaymentDate, entitlements, feature flags
 * - getUsage — commandes, preuves, agents, overage accumulé
 * - getPaymentHistory — paiements + overages
 * - cancelSubscription — Paystack disable + update Tenant
 * - getManageCardLink — lien Paystack hosted
 */

import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { canManageGrid } from "~/lib/rbac";
import { db } from "~/server/db";
import { getUsageThisCycle } from "~/server/subscription/usage";
import {
  disableSubscription,
  generateManageLink,
} from "~/server/payment/paystack";
import { SUBSCRIPTION_PLANS, type PlanId } from "~/lib/subscription-plans";

/** Guard: Only OWNER/MANAGER can access subscription management */
function assertCanManageSubscription(role: string) {
  if (!canManageGrid(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Seuls Owner et Manager peuvent gérer l'abonnement.",
    });
  }
}

export const subscriptionRouter = createTRPCRouter({
  /**
   * Get current subscription info for the tenant.
   */
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    assertCanManageSubscription(ctx.session.user.role as string);
    const tenantId = ctx.session.user.tenantId;

    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        subscriptionPlan: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        cycleStartedAt: true,
        paystackSubscriptionCode: true,
        maxConfirmedOrdersPerMonth: true,
        maxProofsPerMonth: true,
        maxAgents: true,
        overagePerOrderCents: true,
        hasExportCsv: true,
        hasAdvancedExports: true,
        hasNotificationsOutside24h: true,
        hasDepositRecommended: true,
        hasAdvancedFilters: true,
        hasPrioritySupport: true,
        showBranding: true,
        showUpgradeBanner: true,
      },
    });

    const planConfig = SUBSCRIPTION_PLANS[tenant.subscriptionPlan as PlanId] ?? SUBSCRIPTION_PLANS.free;

    return {
      plan: tenant.subscriptionPlan,
      planName: planConfig.name,
      planPrice: planConfig.price,
      status: tenant.subscriptionStatus,
      expiresAt: tenant.subscriptionExpiresAt,
      cycleStartedAt: tenant.cycleStartedAt,
      hasPaystackSubscription: !!tenant.paystackSubscriptionCode,
      entitlements: {
        maxConfirmedOrdersPerMonth: tenant.maxConfirmedOrdersPerMonth,
        maxProofsPerMonth: tenant.maxProofsPerMonth,
        maxAgents: tenant.maxAgents,
        overagePerOrderCents: tenant.overagePerOrderCents,
        hasExportCsv: tenant.hasExportCsv,
        hasAdvancedExports: tenant.hasAdvancedExports,
        hasNotificationsOutside24h: tenant.hasNotificationsOutside24h,
        hasDepositRecommended: tenant.hasDepositRecommended,
        hasAdvancedFilters: tenant.hasAdvancedFilters,
        hasPrioritySupport: tenant.hasPrioritySupport,
        showBranding: tenant.showBranding,
        showUpgradeBanner: tenant.showUpgradeBanner,
      },
    };
  }),

  /**
   * Get current cycle usage for the tenant.
   */
  getUsage: protectedProcedure.query(async ({ ctx }) => {
    assertCanManageSubscription(ctx.session.user.role as string);
    const tenantId = ctx.session.user.tenantId;

    const usage = await getUsageThisCycle(tenantId);

    return {
      confirmedOrders: usage.confirmedOrders,
      maxConfirmedOrders: usage.maxConfirmedOrders,
      proofs: usage.proofs,
      maxProofs: usage.maxProofs,
      agents: usage.agents,
      maxAgents: usage.maxAgents,
      overageCount: usage.overageCount,
      overageAmountFCFA: usage.overageAmountFCFA,
      cycleStart: usage.cycleStart,
      plan: usage.plan,
    };
  }),

  /**
   * Get payment history (subscriptions + overages).
   */
  getPaymentHistory: protectedProcedure.query(async ({ ctx }) => {
    assertCanManageSubscription(ctx.session.user.role as string);
    const tenantId = ctx.session.user.tenantId;

    const payments = await db.subscriptionPayment.findMany({
      where: { tenantId, status: { not: "pending" } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        type: true,
        plan: true,
        amount: true,
        currency: true,
        status: true,
        channel: true,
        cardLast4: true,
        overageDetails: true,
        createdAt: true,
      },
    });

    return payments;
  }),

  /**
   * Cancel subscription — calls Paystack disable + updates Tenant status.
   */
  cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    assertCanManageSubscription(ctx.session.user.role as string);
    const tenantId = ctx.session.user.tenantId;

    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        subscriptionPlan: true,
        subscriptionStatus: true,
        paystackSubscriptionCode: true,
        paystackEmailToken: true,
      },
    });

    if (tenant.subscriptionPlan === "free") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Pas d'abonnement actif à annuler.",
      });
    }

    if (
      tenant.subscriptionStatus === "cancelled" ||
      tenant.subscriptionStatus === "non_renewing"
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "L'abonnement est déjà annulé ou en cours d'annulation.",
      });
    }

    // Disable on Paystack if we have the codes
    if (tenant.paystackSubscriptionCode && tenant.paystackEmailToken) {
      try {
        await disableSubscription(
          tenant.paystackSubscriptionCode,
          tenant.paystackEmailToken,
        );
      } catch (error) {
        console.error("Paystack disableSubscription failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Échec de l'annulation chez Paystack. Réessayez.",
        });
      }
    }

    // Update tenant status: non_renewing (access maintained until end of period)
    await db.tenant.update({
      where: { id: tenantId },
      data: { subscriptionStatus: "non_renewing" },
    });

    return { ok: true, status: "non_renewing" };
  }),

  /**
   * Get Paystack manage link for updating payment card.
   */
  getManageCardLink: protectedProcedure.query(async ({ ctx }) => {
    assertCanManageSubscription(ctx.session.user.role as string);
    const tenantId = ctx.session.user.tenantId;

    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { paystackSubscriptionCode: true },
    });

    if (!tenant.paystackSubscriptionCode) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Pas d'abonnement Paystack actif.",
      });
    }

    const result = await generateManageLink(tenant.paystackSubscriptionCode);
    return { link: result.data.link };
  }),
});
