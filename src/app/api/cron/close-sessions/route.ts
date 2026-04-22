/**
 * GET /api/cron/close-sessions — endpoint de fallback manuel / ops
 *
 * Ferme les sessions live inactives (Story 2.6) et promeut les items vers le catalogue (Story 8.2).
 *
 * En production, la planification primaire tourne sur Railway via pg-boss.
 * Cet endpoint reste disponible pour debug / exécution manuelle.
 */
import { NextResponse } from "next/server";
import { env } from "~/env";
import { workerLogger } from "~/lib/logger";
import { runCloseInactiveLiveSessions } from "~/server/workers/close-inactive-live-sessions";

export async function GET(request: Request) {
  if (env.CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  try {
    const result = await runCloseInactiveLiveSessions();

    workerLogger.info("Cron close-sessions completed", result);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    workerLogger.error("Cron close-sessions failed", error, {});
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
