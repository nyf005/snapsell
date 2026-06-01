/**
 * GET /api/cron/deposit-expiry — endpoint de fallback manuel / ops
 *
 * Annule les commandes en confirmed_pending_deposit dont le délai d'acompte est expiré
 * et notifie les clients via WhatsApp.
 *
 * En production, la planification primaire tourne sur Railway via pg-boss.
 * Cet endpoint reste disponible pour debug / exécution manuelle.
 */

import { NextResponse } from "next/server";
import { workerLogger } from "~/lib/logger";
import { requireCronAuthorization } from "~/server/cron/auth";
import { runDepositExpiryJob } from "~/server/workers/deposit-expiry";

export async function GET(request: Request) {
  const unauthorized = requireCronAuthorization(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await runDepositExpiryJob();

    workerLogger.info("Cron deposit-expiry completed", result);

    return NextResponse.json({ ok: true, expiredCount: result.expiredCount });
  } catch (error) {
    workerLogger.error("Cron deposit-expiry failed", error, {});
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
