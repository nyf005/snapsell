/**
 * POST /api/payment/buy-credits
 *
 * Initie un achat de pack de crédits supplémentaires via Paystack (paiement one-time).
 * Body : { packs: number }  — nombre de packs de 100 crédits (1–10)
 *
 * Prix par pack selon le plan actuel du tenant :
 *   Free    → 3 000 FCA
 *   Starter → 2 500 FCA
 *   Pro     → 2 000 FCA
 *
 * Retourne { authorization_url } pour redirection vers Paystack.
 * Les crédits sont crédités dans le webhook charge.success (metadata.type = "credits_topup").
 */

import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { canManageGrid } from "~/lib/rbac";
import { db } from "~/server/db";
import { getPlanConfig } from "~/lib/subscription-plans";
import { initializeOneTimeTransaction } from "~/server/payment/paystack";
import { workerLogger } from "~/lib/logger";

const CREDITS_PER_PACK = 100;
const MAX_PACKS = 10;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (!canManageGrid(session.user.role as string)) {
    return NextResponse.json({ error: "Seuls Owner et Manager peuvent acheter des crédits" }, { status: 403 });
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant non identifié" }, { status: 400 });
  }

  let body: { packs?: unknown };
  try {
    body = await request.json() as { packs?: unknown };
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 });
  }

  const packs = Number(body.packs);
  if (!Number.isInteger(packs) || packs < 1 || packs > MAX_PACKS) {
    return NextResponse.json(
      { error: `Nombre de packs invalide. Valeur attendue entre 1 et ${MAX_PACKS}.` },
      { status: 400 },
    );
  }

  // Résoudre le prix selon le plan actuel
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { subscriptionPlan: true },
  });

  const planConfig = getPlanConfig(tenant?.subscriptionPlan ?? "free");
  const packPriceFCFA = planConfig.creditPackPriceFCFA;

  if (packPriceFCFA === null) {
    return NextResponse.json(
      { error: "L'achat de crédits n'est pas disponible pour votre plan." },
      { status: 403 },
    );
  }

  const totalFCFA = packs * packPriceFCFA;
  const totalSubunits = totalFCFA * 100; // Paystack attend en sous-unités
  const creditsAmount = packs * CREDITS_PER_PACK;

  const origin = new URL(request.url).origin;
  const callbackUrl = `${origin}/parametres/abonnement?payment=callback&type=credits`;

  try {
    const paystackResponse = await initializeOneTimeTransaction(
      session.user.email,
      totalSubunits,
      {
        tenantId,
        userId: session.user.id,
        type: "credits_topup",
        creditsAmount,
        packs,
        packPriceFCFA,
      },
      callbackUrl,
    );

    return NextResponse.json({
      authorization_url: paystackResponse.data.authorization_url,
      reference: paystackResponse.data.reference,
      creditsAmount,
      totalFCFA,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workerLogger.warn("buy-credits: Paystack initializeOneTimeTransaction failed", {
      tenantId,
      packs,
      message,
    });
    return NextResponse.json(
      { error: "Échec de l'initialisation du paiement. Réessayez." },
      { status: 500 },
    );
  }
}
