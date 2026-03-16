/**
 * GET /api/cron/reservation-ttl — Vercel Cron Job (toutes les minutes)
 *
 * Exécute deux passes dans l'ordre :
 *   1. Rappels T-2 min (Story 4.4) : envoie un message aux clients dont la réservation expire dans 2 min
 *   2. Expirations TTL (Story 4.3) : expire les réservations arrivées à T=0 et promeut les files d'attente
 *
 * Sécurité: Vercel injecte automatiquement Authorization: Bearer <CRON_SECRET>
 * quand CRON_SECRET est défini dans les variables d'environnement Vercel.
 *
 * Configuration vercel.json:
 *   { "path": "/api/cron/reservation-ttl", "schedule": "* * * * *" }
 */
import { NextResponse } from "next/server";
import { env } from "~/env";
import { workerLogger } from "~/lib/logger";
import {
  runReservationReminderJob,
  runReservationTtlJob,
} from "~/server/workers/reservation-ttl";

export async function GET(request: Request) {
  // Vérification du secret cron (optionnelle en dev si CRON_SECRET absent)
  if (env.CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  try {
    const reminderResult = await runReservationReminderJob();
    const ttlResult = await runReservationTtlJob();

    workerLogger.info("Cron reservation-ttl completed", {
      ...reminderResult,
      ...ttlResult,
    });

    return NextResponse.json({
      ok: true,
      reminderSentCount: reminderResult.reminderSentCount,
      expiredCount: ttlResult.expiredCount,
      promotedCount: ttlResult.promotedCount,
    });
  } catch (error) {
    workerLogger.error("Cron reservation-ttl failed", error, {});
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
