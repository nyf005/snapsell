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
import { workerLogger } from "~/lib/logger";
import { requireCronAuthorization } from "~/server/cron/auth";
import { runMetaCatalogueSyncJob } from "~/server/workers/meta-catalogue-sync";

export async function GET(request: Request) {
  const unauthorized = requireCronAuthorization(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await runMetaCatalogueSyncJob();
    return NextResponse.json(result);
  } catch (error) {
    workerLogger.error("Cron meta-catalogue-sync failed", error, {});
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
