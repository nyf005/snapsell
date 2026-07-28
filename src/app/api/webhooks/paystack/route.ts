/**
 * Story 7A.2 — AC #7, #8, #14: Webhook Paystack
 *
 * Events handled:
 * - charge.success → Update tenant subscription, create SubscriptionPayment
 * - subscription.create → Store subscription codes (SUB_xxx, CUS_xxx, emailToken, authorizationCode)
 * - invoice.payment_failed → Set status to "attention"
 * - subscription.disable → Set status to "cancelled"
 * - subscription.not_renew → Set status to "non_renewing"
 *
 * Patterns: HMAC SHA-512, idempotence on paystackReference, always 200 OK.
 */

import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { verifyWebhookSignature } from "~/server/payment/paystack";
import { getPlanConfig, SUBSCRIPTION_PLANS, type PlanId } from "~/lib/subscription-plans";
import { workerLogger } from "~/lib/logger";

export async function POST(request: Request) {
  // 1. Read raw body for HMAC verification
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";

  // 2. Verify HMAC SHA-512
  if (!verifyWebhookSignature(rawBody, signature)) {
    workerLogger.warn("Paystack webhook: invalid signature");
    // Still return 200 to avoid retries on signature mismatch
    return NextResponse.json({ status: "invalid_signature" }, { status: 200 });
  }

  // 3. Parse event
  let event: PaystackWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PaystackWebhookEvent;
  } catch {
    return NextResponse.json({ status: "invalid_json" }, { status: 200 });
  }

  // 4. Route event
  try {
    switch (event.event) {
      case "charge.success":
        if (event.data.metadata?.type === "credits_topup") {
          await handleCreditsTopup(event.data);
        } else {
          await handleChargeSuccess(event.data);
        }
        break;
      case "subscription.create":
        await handleSubscriptionCreate(event.data);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data);
        break;
      case "subscription.disable":
        await handleSubscriptionDisable(event.data);
        break;
      case "subscription.not_renew":
        await handleSubscriptionNotRenew(event.data);
        break;
      default:
        workerLogger.warn("Paystack webhook: unhandled event", { event: event.event });
    }
  } catch (error) {
    workerLogger.warn("Paystack webhook error processing event", { event: event.event, error });
    // Still return 200 — we don't want Paystack to retry indefinitely
  }

  return NextResponse.json({ status: "ok" }, { status: 200 });
}

// --------------- Types ---------------

interface PaystackWebhookEvent {
  event: string;
  data: PaystackWebhookData;
}

interface PaystackWebhookData {
  reference?: string;
  status?: string;
  amount?: number;
  currency?: string;
  channel?: string;
  metadata?: {
    tenantId?: string;
    plan?: string;
    userId?: string;
    [key: string]: unknown;
  };
  customer?: {
    customer_code?: string;
    email?: string;
  };
  authorization?: {
    authorization_code?: string;
    last4?: string;
    channel?: string;
  };
  plan?: {
    plan_code?: string;
    name?: string;
  };
  subscription_code?: string;
  email_token?: string;
  subscription?: {
    subscription_code?: string;
    email_token?: string;
  };
}

// --------------- Handlers ---------------

const PENDING_PAYMENT_LOOKBACK_MS = 48 * 60 * 60 * 1000; // 48h

/**
 * charge.success: First payment or renewal.
 * - Create/update SubscriptionPayment (idempotent on reference)
 * - If reference unknown, reconcile with pending payment for same tenant to avoid duplicate row
 * - Resolve tenantId/plan from metadata or from existing payment (Paystack may not echo metadata)
 * - Update Tenant subscription fields + entitlements
 * - On renewal: reset cycle, extend expiresAt
 */
async function handleChargeSuccess(data: PaystackWebhookData) {
  const reference = data.reference;
  if (!reference) return;

  const existingByRef = await db.subscriptionPayment.findUnique({
    where: { paystackReference: reference },
  });

  if (existingByRef?.status === "success") {
    return; // Already processed
  }

  // Resolve tenantId and plan from webhook metadata or from our existing row (Paystack may not echo metadata)
  const tenantId =
    (data.metadata?.tenantId as string | undefined) ?? existingByRef?.tenantId ?? null;
  let planId = ((data.metadata?.plan ?? existingByRef?.plan) as PlanId | undefined) ?? undefined;

  if (!tenantId) {
    workerLogger.warn("Paystack charge.success: no tenantId in metadata or existing payment", {
      reference,
    });
    return;
  }

  const amount = data.amount ?? 0;
  const successData = {
    status: "success" as const,
    channel: data.authorization?.channel ?? data.channel ?? null,
    cardLast4: data.authorization?.last4 ?? null,
    ...(planId && { plan: planId }),
    amount: Math.round(amount / 100), // Paystack sends in subunits → FCFA
    metadata: (data.metadata as Record<string, string | number | boolean> | undefined) ?? undefined,
  };

  if (existingByRef) {
    await db.subscriptionPayment.update({
      where: { paystackReference: reference },
      data: successData,
    });
  } else {
    // Reference not in DB: may be a different ref than the one we got at init → reconcile with pending to avoid duplicate
    const since = new Date(Date.now() - PENDING_PAYMENT_LOOKBACK_MS);
    const pending = await db.subscriptionPayment.findFirst({
      where: {
        tenantId,
        status: "pending",
        createdAt: { gte: since },
        ...(planId && { plan: planId }),
      },
      orderBy: { createdAt: "desc" },
    });

    if (pending) {
      if (!planId && pending.plan) planId = pending.plan as PlanId;
      await db.subscriptionPayment.update({
        where: { id: pending.id },
        data: {
          paystackReference: reference,
          ...successData,
          ...(planId && { plan: planId }),
        },
      });
    } else {
      await db.subscriptionPayment.create({
        data: {
          tenantId,
          paystackReference: reference,
          type: "subscription",
          plan: planId ?? null,
          amount: Math.round(amount / 100),
          status: "success",
          channel: data.authorization?.channel ?? data.channel ?? null,
          cardLast4: data.authorization?.last4 ?? null,
          metadata: (data.metadata as Record<string, string | number | boolean> | undefined) ?? undefined,
        },
      });
    }
  }

  // Update tenant subscription
  if (planId && (planId === "starter" || planId === "pro")) {
    const planConfig = getPlanConfig(planId);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days

    // Detect renewal: tenant already has an active paid subscription
    const currentTenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { subscriptionPlan: true, subscriptionStatus: true },
    });
    const isRenewal =
      currentTenant != null &&
      currentTenant.subscriptionPlan !== "free" &&
      (currentTenant.subscriptionStatus === "active" ||
        currentTenant.subscriptionStatus === "non_renewing");

    await db.tenant.update({
      where: { id: tenantId },
      data: {
        subscriptionPlan: planId,
        subscriptionStatus: "active",
        subscriptionExpiresAt: expiresAt,
        cycleStartedAt: now, // Reset cycle → usage counters reset (dynamic COUNT from this date)
        // Prochaine échéance de renouvellement des crédits, lue par le cron
        // `credits-monthly-reset`. Sans elle, les crédits ne se rechargeraient
        // qu'au prochain paiement Paystack.
        usageResetDate: expiresAt,
        // Reset credits on upgrade/renewal
        creditsTotalMonthly: planConfig.entitlements.creditsTotalMonthly,
        creditsBalance: planConfig.entitlements.creditsTotalMonthly,
        lowCreditsAlerted: false,
        // Store authorization for future charges
        paystackAuthorizationCode: data.authorization?.authorization_code ?? undefined,
        // Entitlements from plan config
        maxConfirmedOrdersPerMonth: planConfig.entitlements.maxConfirmedOrdersPerMonth,
        maxProofsPerMonth: planConfig.entitlements.maxProofsPerMonth,
        maxAgents: planConfig.entitlements.maxAgents,
        overagePerOrderCents: planConfig.entitlements.overagePerOrderCents,
        hasExportCsv: planConfig.entitlements.hasExportCsv,
        hasAdvancedExports: planConfig.entitlements.hasAdvancedExports,
        hasNotificationsOutside24h: planConfig.entitlements.hasNotificationsOutside24h,
        hasDepositRecommended: planConfig.entitlements.hasDepositRecommended,
        hasAdvancedFilters: planConfig.entitlements.hasAdvancedFilters,
        hasPrioritySupport: planConfig.entitlements.hasPrioritySupport,
        hasAI: planConfig.entitlements.hasAI,
        showBranding: planConfig.entitlements.showBranding,
        showUpgradeBanner: planConfig.entitlements.showUpgradeBanner,
        // On first subscription (not renewal), auto-enable deposit if plan recommends it
        ...(!isRenewal && planConfig.entitlements.hasDepositRecommended ? { requireDeposit: true } : {}),
      },
    });
  }
}

/**
 * charge.success (credits_topup): Crédite creditsBonus sur le tenant.
 */
async function handleCreditsTopup(data: PaystackWebhookData) {
  const reference = data.reference;
  if (!reference) return;

  // Idempotence
  const existing = await db.subscriptionPayment.findUnique({
    where: { paystackReference: reference },
  });
  if (existing?.status === "success") return;

  const tenantId = data.metadata?.tenantId as string | undefined;
  const creditsAmount = data.metadata?.creditsAmount as number | undefined;

  if (!tenantId || !creditsAmount || creditsAmount <= 0) {
    workerLogger.warn("handleCreditsTopup: missing tenantId or creditsAmount", { reference });
    return;
  }

  const amount = Math.round((data.amount ?? 0) / 100); // subunits → FCFA
  const channel = data.authorization?.channel ?? data.channel ?? null;
  const cardLast4 = data.authorization?.last4 ?? null;

  if (existing) {
    await db.subscriptionPayment.update({
      where: { paystackReference: reference },
      data: { status: "success", amount, channel, cardLast4 },
    });
  } else {
    await db.subscriptionPayment.create({
      data: {
        tenantId,
        paystackReference: reference,
        type: "credits_topup",
        amount,
        status: "success",
        channel,
        cardLast4,
        metadata: data.metadata as Record<string, string | number | boolean> | undefined,
      },
    });
  }

  await db.tenant.update({
    where: { id: tenantId },
    data: { creditsBonus: { increment: creditsAmount } },
  });

  workerLogger.info("Credits topup applied", { tenantId, creditsAmount, reference });
}

/**
 * subscription.create: Store Paystack subscription references.
 */
async function handleSubscriptionCreate(data: PaystackWebhookData) {
  const tenantId = data.metadata?.tenantId;
  const subscriptionCode = data.subscription_code ?? data.subscription?.subscription_code;
  const emailToken = data.email_token ?? data.subscription?.email_token;
  const customerCode = data.customer?.customer_code;

  if (!tenantId || !subscriptionCode) {
    workerLogger.warn("Paystack subscription.create: missing tenantId or subscription_code");
    return;
  }

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      paystackSubscriptionCode: subscriptionCode,
      paystackEmailToken: emailToken ?? undefined,
      paystackCustomerCode: customerCode ?? undefined,
      paystackAuthorizationCode: data.authorization?.authorization_code ?? undefined,
    },
  });
}

/**
 * invoice.payment_failed: Set subscription to "attention" status.
 */
async function handlePaymentFailed(data: PaystackWebhookData) {
  const tenantId = data.metadata?.tenantId;
  if (!tenantId) {
    // Try to find by subscription code
    const subCode = data.subscription?.subscription_code ?? data.subscription_code;
    if (subCode) {
      const tenant = await db.tenant.findUnique({
        where: { paystackSubscriptionCode: subCode },
        select: { id: true },
      });
      if (tenant) {
        await db.tenant.update({
          where: { id: tenant.id },
          data: { subscriptionStatus: "attention" },
        });
      }
    }
    return;
  }

  await db.tenant.update({
    where: { id: tenantId },
    data: { subscriptionStatus: "attention" },
  });
}

/**
 * subscription.disable: Subscription cancelled completely — downgrade to Free.
 */
async function handleSubscriptionDisable(data: PaystackWebhookData) {
  const subCode = data.subscription_code ?? data.subscription?.subscription_code;
  if (!subCode) return;

  const tenant = await db.tenant.findUnique({
    where: { paystackSubscriptionCode: subCode },
    select: { id: true },
  });

  if (tenant) {
    const freePlan = SUBSCRIPTION_PLANS.free;
    await db.tenant.update({
      where: { id: tenant.id },
      data: {
        subscriptionStatus: "cancelled",
        subscriptionPlan: "free",
        // Reset to Free entitlements
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
    workerLogger.info("Subscription disabled — downgraded to Free", { tenantId: tenant.id });
  }
}

/**
 * subscription.not_renew: User requested cancellation, access until end of period.
 */
async function handleSubscriptionNotRenew(data: PaystackWebhookData) {
  const subCode = data.subscription_code ?? data.subscription?.subscription_code;
  if (!subCode) return;

  const tenant = await db.tenant.findUnique({
    where: { paystackSubscriptionCode: subCode },
    select: { id: true },
  });

  if (tenant) {
    await db.tenant.update({
      where: { id: tenant.id },
      data: { subscriptionStatus: "non_renewing" },
    });
  }
}
