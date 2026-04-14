/**
 * GET /api/cron/deposit-expiry — Vercel Cron Job (toutes les minutes)
 *
 * Annule les commandes en confirmed_pending_deposit dont le délai d'acompte est expiré
 * et notifie les clients via WhatsApp.
 *
 * Configuration vercel.json :
 *   { "path": "/api/cron/deposit-expiry", "schedule": "* * * * *" }
 */

import { NextResponse } from "next/server";
import { env } from "~/env";
import { workerLogger } from "~/lib/logger";
import { runDepositExpiryJob } from "~/server/workers/deposit-expiry";

export async function GET(request: Request) {
  if (env.CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  try {
    const result = await runDepositExpiryJob();

    workerLogger.info("Cron deposit-expiry completed", result);

    return NextResponse.json({ ok: true, expiredCount: result.expiredCount });
  } catch (error) {
    workerLogger.error("Cron deposit-expiry failed", error, {});
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
