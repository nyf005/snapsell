/**
 * GET /api/cron/meta-catalogue-sync — endpoint de fallback manuel / ops
 *
 * Synchronise les articles catalogue éligibles vers Meta Commerce Manager.
 * Éligible : name + mediaStorageKey non null, availableQty > 0, syncedToMeta = false.
 *
 * En production, la planification primaire tourne sur Railway via pg-boss.
 * Cet endpoint reste disponible pour debug / exécution manuelle.
 */

import { NextResponse } from "next/server";
import { env } from "~/env";
import { workerLogger } from "~/lib/logger";
import { runMetaCatalogueSyncJob } from "~/server/workers/meta-catalogue-sync";

export async function GET(request: Request) {
  if (env.CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  try {
    const result = await runMetaCatalogueSyncJob();
    return NextResponse.json(result);
  } catch (error) {
    workerLogger.error("Cron meta-catalogue-sync failed", error, {});
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
