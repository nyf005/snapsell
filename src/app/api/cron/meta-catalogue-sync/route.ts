/**
 * GET /api/cron/meta-catalogue-sync — Vercel Cron Job (toutes les heures)
 *
 * Synchronise les articles catalogue éligibles vers Meta Commerce Manager.
 * Éligible : name + mediaStorageKey non null, availableQty > 0, syncedToMeta = false.
 *
 * Sécurité: Vercel injecte automatiquement Authorization: Bearer <CRON_SECRET>
 * quand CRON_SECRET est défini dans les variables d'environnement Vercel.
 *
 * Configuration vercel.json:
 *   path: /api/cron/meta-catalogue-sync, schedule: "0 * * * *"
 */

import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { syncPendingCatalogueItems } from "~/server/catalogue/syncCatalogueItemToMeta";
import { env } from "~/env";
import { workerLogger } from "~/lib/logger";

export async function GET(request: Request) {
  if (env.CRON_SECRET) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  if (env.META_CATALOG_SYNC_ENABLED !== "true") {
    return NextResponse.json({ ok: true, skipped: true, reason: "sync_disabled" });
  }

  try {
    // Traiter uniquement les tenants avec l'entitlement activé et un catalogue configuré
    const tenants = await db.tenant.findMany({
      where: { hasMetaCatalogSync: true, metaCatalogId: { not: null } },
      select: { id: true },
    });

    let totalSynced = 0;
    let totalFailed = 0;

    for (const { id: tenantId } of tenants) {
      const { synced, failed } = await syncPendingCatalogueItems(tenantId);
      totalSynced += synced;
      totalFailed += failed;
    }

    workerLogger.info("Cron meta-catalogue-sync completed", {
      tenants: tenants.length,
      totalSynced,
      totalFailed,
    });

    return NextResponse.json({ ok: true, tenants: tenants.length, totalSynced, totalFailed });
  } catch (error) {
    workerLogger.error("Cron meta-catalogue-sync failed", error, {});
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
