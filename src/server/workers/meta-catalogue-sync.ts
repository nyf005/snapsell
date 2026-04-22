import { db } from "~/server/db";
import { env } from "~/env";
import { workerLogger } from "~/lib/logger";
import { syncPendingCatalogueItems } from "~/server/catalogue/syncCatalogueItemToMeta";

export type MetaCatalogueSyncRunResult =
  | { ok: true; skipped: true; reason: "sync_disabled" }
  | {
      ok: true;
      skipped?: false;
      tenants: number;
      totalSynced: number;
      totalFailed: number;
    };

export async function runMetaCatalogueSyncJob(): Promise<MetaCatalogueSyncRunResult> {
  if (env.META_CATALOG_SYNC_ENABLED !== "true") {
    return { ok: true, skipped: true, reason: "sync_disabled" };
  }

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

  return {
    ok: true,
    tenants: tenants.length,
    totalSynced,
    totalFailed,
  };
}
