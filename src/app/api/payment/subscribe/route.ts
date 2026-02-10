/**
 * Story 7A.2 — AC #6: POST /api/payment/subscribe
 *
 * Auth + rôle OWNER/MANAGER, init transaction Paystack avec plan_code,
 * retourne authorization_url. Aucune ligne en base ici : le paiement est
 * enregistré uniquement au webhook charge.success après paiement effectué.
 */

import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { canManageGrid } from "~/lib/rbac";
import { getPlanConfig, getPaystackPlanCode } from "~/lib/subscription-plans";
import { initializeTransaction } from "~/server/payment/paystack";
import { workerLogger } from "~/lib/logger";

/**
 * Validate auth/role, init Paystack transaction. No DB write — payment row
 * is created only in webhook on charge.success.
 */
async function initiateSubscription(
  planId: string,
  callbackUrl: string,
): Promise<
  | { ok: true; authorizationUrl: string; reference: string }
  | { ok: false; error: string; status: number }
> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "Non authentifié", status: 401 };
  }

  if (!canManageGrid(session.user.role as string)) {
    return { ok: false, error: "Seuls Owner et Manager peuvent gérer l'abonnement", status: 403 };
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    return { ok: false, error: "Tenant non identifié", status: 400 };
  }

  if (!planId || (planId !== "starter" && planId !== "pro")) {
    return { ok: false, error: "Plan invalide. Valeurs acceptées: starter, pro", status: 400 };
  }

  const planConfig = getPlanConfig(planId);
  const paystackPlanCode = getPaystackPlanCode(planConfig);
  if (!paystackPlanCode) {
    return { ok: false, error: "Plan code Paystack non configuré", status: 500 };
  }

  const amountSubunits = Math.round(planConfig.price * 100);

  try {
    const paystackResponse = await initializeTransaction(
      session.user.email,
      paystackPlanCode,
      { tenantId, plan: planId, userId: session.user.id },
      callbackUrl,
      amountSubunits,
      planConfig.currency,
    );

    return {
      ok: true,
      authorizationUrl: paystackResponse.data.authorization_url,
      reference: paystackResponse.data.reference,
    };
  } catch (error) {
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
