/**
 * GET /api/cron/close-sessions — endpoint de fallback manuel / ops
 *
 * Ferme les sessions live inactives (Story 2.6) et promeut les items vers le catalogue (Story 8.2).
 *
 * En production, la planification primaire tourne sur Railway via pg-boss.
 * Cet endpoint reste disponible pour debug / exécution manuelle.
 */
import { NextResponse } from "next/server";
import { workerLogger } from "~/lib/logger";
import { requireCronAuthorization } from "~/server/cron/auth";
import { runCloseInactiveLiveSessions } from "~/server/workers/close-inactive-live-sessions";

export async function GET(request: Request) {
  const unauthorized = requireCronAuthorization(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await runCloseInactiveLiveSessions();

    workerLogger.info("Cron close-sessions completed", result);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    workerLogger.error("Cron close-sessions failed", error, {});
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
