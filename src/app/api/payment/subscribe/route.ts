/**
 * Story 7A.2 — AC #6: POST /api/payment/subscribe
 *
 * Auth + rôle OWNER/MANAGER, init transaction Paystack avec plan_code,
 * crée SubscriptionPayment pending, retourne authorization_url.
 * One pending per tenant+plan (DB unique index) to avoid duplicate rows on double-click.
 */

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "~/server/auth";
import { canManageGrid } from "~/lib/rbac";
import { db } from "~/server/db";
import { getPlanConfig, getPaystackPlanCode } from "~/lib/subscription-plans";
import { initializeTransaction } from "~/server/payment/paystack";
import { workerLogger } from "~/lib/logger";

/**
 * Shared logic: validate auth/role, init Paystack transaction, create pending payment.
 * Returns the Paystack response on success, or a descriptive error.
 */
async function initiateSubscription(
  planId: string,
  callbackUrl: string,
): Promise<
  | { ok: true; authorizationUrl: string; reference: string }
  | { ok: false; error: string; status: number }
> {
  // 1. Auth check
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "Non authentifié", status: 401 };
  }

  // 2. Role check (OWNER/MANAGER)
  if (!canManageGrid(session.user.role as string)) {
    return { ok: false, error: "Seuls Owner et Manager peuvent gérer l'abonnement", status: 403 };
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    return { ok: false, error: "Tenant non identifié", status: 400 };
  }

  // 3. Plan validation
  if (!planId || (planId !== "starter" && planId !== "pro")) {
    return { ok: false, error: "Plan invalide. Valeurs acceptées: starter, pro", status: 400 };
  }

  // 4. Get plan config + Paystack plan code
  const planConfig = getPlanConfig(planId);
  const paystackPlanCode = getPaystackPlanCode(planConfig);
  if (!paystackPlanCode) {
    return { ok: false, error: "Plan code Paystack non configuré", status: 500 };
  }

  // 4b. One pending per tenant+plan: create row first with temp ref so concurrent requests hit unique constraint
  const tempRef = `pending_${randomUUID()}`;
  const amountSubunits = Math.round(planConfig.price * 100);

  try {
    await db.subscriptionPayment.create({
      data: {
        tenantId,
        paystackReference: tempRef,
        type: "subscription",
        plan: planId,
        amount: planConfig.price,
        status: "pending",
        metadata: { initiated_by: session.user.id },
      },
    });
  } catch (createError: unknown) {
    const isUniqueViolation =
      typeof createError === "object" &&
      createError !== null &&
      "code" in createError &&
      (createError as { code?: string }).code === "P2002";
    if (isUniqueViolation) {
      const existingPending = await db.subscriptionPayment.findFirst({
        where: { tenantId, plan: planId, status: "pending", type: "subscription" },
        orderBy: { createdAt: "desc" },
      });
      const stored = existingPending?.metadata as { authorization_url?: string } | null;
      if (existingPending && typeof stored?.authorization_url === "string") {
        return {
          ok: true,
          authorizationUrl: stored.authorization_url,
          reference: existingPending.paystackReference,
        };
      }
      return { ok: false, error: "Un paiement est déjà en cours pour ce plan.", status: 409 };
    }
    throw createError;
  }

  // 5. Init Paystack then update row with real reference and URL
  try {
    const paystackResponse = await initializeTransaction(
      session.user.email,
      paystackPlanCode,
      { tenantId, plan: planId, userId: session.user.id },
      callbackUrl,
      amountSubunits,
      planConfig.currency,
    );

    await db.subscriptionPayment.update({
      where: { paystackReference: tempRef },
      data: {
        paystackReference: paystackResponse.data.reference,
        metadata: {
          access_code: paystackResponse.data.access_code,
          authorization_url: paystackResponse.data.authorization_url,
          initiated_by: session.user.id,
        },
      },
    });

    return {
      ok: true,
      authorizationUrl: paystackResponse.data.authorization_url,
      reference: paystackResponse.data.reference,
    };
  } catch (error) {
    await db.subscriptionPayment.deleteMany({ where: { paystackReference: tempRef } }).catch(() => {});
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    workerLogger.warn("Paystack initializeTransaction error", {
      message,
      stack: stack?.slice(0, 500),
      planId,
      tenantId,
    });
    return { ok: false, error: "Échec de l'initialisation du paiement", status: 500 };
  }
}

export async function POST(request: Request) {
  // Parse body
  let body: { plan?: string };
  try {
    body = await request.json() as { plan?: string };
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const callbackUrl = `${appUrl}/parametres/abonnement?payment=callback`;

  const result = await initiateSubscription(body.plan ?? "", callbackUrl);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    authorization_url: result.authorizationUrl,
    reference: result.reference,
  });
}

/**
 * GET handler — redirect to Paystack checkout (for CTA links).
 * Query param: ?plan=starter or ?plan=pro
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const planId = url.searchParams.get("plan") ?? "";

  // Auth check (redirect to login if not authenticated)
  const session = await auth();
  if (!session?.user) {
    const loginUrl = planId
      ? `/login?tab=signup&plan=${planId}`
      : "/login?tab=signup";
    return NextResponse.redirect(new URL(loginUrl, url.origin));
  }

  if (!canManageGrid(session.user.role as string)) {
    return NextResponse.redirect(new URL("/dashboard", url.origin));
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
  const callbackUrl = `${appUrl}/parametres/abonnement?payment=callback`;

  const result = await initiateSubscription(planId, callbackUrl);

  if (!result.ok) {
    return NextResponse.redirect(new URL("/tarifs?error=payment_init_failed", url.origin));
  }

  return NextResponse.redirect(result.authorizationUrl);
}
