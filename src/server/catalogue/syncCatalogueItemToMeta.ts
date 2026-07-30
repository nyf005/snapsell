/**
 * Synchro CatalogueItem → Meta Commerce Manager
 *
 * Éligibilité : name non null + mediaStorageKey non null + availableQty > 0
 * Entitlement : tenant.hasMetaCatalogSync === true (plan Starter/Pro)
 * Env : META_CATALOG_SYNC_ENABLED=true requis
 *
 * Erreurs Meta gérées : 400, 401, 403, 429 (retry x3)
 */

import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";
import { env } from "~/env.js";

const META_GRAPH_URL = "https://graph.facebook.com/v21.0";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export type SyncToMetaResult =
  | { success: true; metaProductId: string; created: boolean }
  | {
      success: false;
      reason:
        | "sync_disabled"
        | "no_entitlement"
        | "no_catalog_configured"
        | "missing_name"
        | "missing_image"
        | "no_access_token"
        | "rate_limited"
        | "unauthorized"
        | "catalog_not_found"
        | "meta_error"
        | "image_url_failed";
    };

export type UnsyncFromMetaResult =
  | { success: true }
  | { success: false; reason: "not_synced" | "meta_error" };

/**
 * Synchronise un article vers le catalogue Meta.
 * Crée ou met à jour selon la présence de metaProductId.
 */
export async function syncCatalogueItemToMeta(
  tenantId: string,
  catalogueItemId: string,
): Promise<SyncToMetaResult> {
  if (env.META_CATALOG_SYNC_ENABLED !== "true") {
    return { success: false, reason: "sync_disabled" };
  }

  const [item, tenant, variants] = await Promise.all([
    db.catalogueItem.findUnique({ where: { id: catalogueItemId } }),
    db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        hasMetaCatalogSync: true,
        metaCatalogId: true,
        metaAccessToken: true,
      },
    }),
    db.itemVariant.findMany({
      where: { catalogueItemId, tenantId },
      select: { label: true, values: true, availableQty: true },
    }),
  ]);

  if (!item || item.tenantId !== tenantId) {
    return { success: false, reason: "meta_error" };
  }
  if (!tenant?.hasMetaCatalogSync) {
    return { success: false, reason: "no_entitlement" };
  }
  if (!tenant.metaCatalogId) {
    return { success: false, reason: "no_catalog_configured" };
  }
  if (!tenant.metaAccessToken) {
    return { success: false, reason: "no_access_token" };
  }
  if (!item.name) {
    return { success: false, reason: "missing_name" };
  }

  // Résoudre l'URL image : proxy permanent si R2, placeholder si configuré, sinon erreur.
  let imageUrl: string | null = null;
  if (item.mediaStorageKey) {
    const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    imageUrl = `${appUrl}/api/media/${item.mediaStorageKey}`;
  } else if (env.CATALOGUE_PLACEHOLDER_IMAGE_URL) {
    imageUrl = env.CATALOGUE_PLACEHOLDER_IMAGE_URL;
  }

  if (!imageUrl) {
    return { success: false, reason: "missing_image" };
  }

  // Construit une description textuelle des variantes disponibles pour Meta Commerce.
  // Exemple: "Taille: S / M / L | Couleur: Rouge / Bleu"
  let description: string | undefined;
  if (variants.length > 0) {
    const dimensionMap = new Map<string, Set<string>>();
    for (const v of variants) {
      if (v.availableQty <= 0) continue;
      const values = v.values as Record<string, string> | null;
      if (!values) continue;
      for (const [dim, val] of Object.entries(values)) {
        if (!dimensionMap.has(dim)) dimensionMap.set(dim, new Set());
        dimensionMap.get(dim)!.add(val);
      }
    }
    if (dimensionMap.size > 0) {
      description = Array.from(dimensionMap.entries())
        .map(([dim, vals]) => `${dim}: ${Array.from(vals).join(" / ")}`)
        .join(" | ");
    }
  }

  const payload: Record<string, unknown> = {
    retailer_id: item.code,
    name: item.name,
    price: item.amount ?? 0,
    currency: "XOF",
    availability: item.availableQty > 0 ? "in stock" : "out of stock",
    image_url: imageUrl,
    ...(description ? { description } : {}),
  };

  const isUpdate = !!item.metaProductId;
  const url = isUpdate
    ? `${META_GRAPH_URL}/${item.metaProductId}`
    : `${META_GRAPH_URL}/${tenant.metaCatalogId}/products`;

  const result = await callMetaCommerceApi(
    isUpdate ? "POST" : "POST",
    url,
    tenant.metaAccessToken,
    payload,
    catalogueItemId,
  );

  if (!result.success) return result;

  const metaProductId: string = isUpdate
    ? item.metaProductId!
    : (result.data as { id: string }).id;

  await db.catalogueItem.update({
    where: { id: catalogueItemId },
    data: {
      metaProductId,
      syncedToMeta: true,
      metaSyncedAt: new Date(),
    },
  });

  workerLogger.info("CatalogueItem synced to Meta", {
    tenantId,
    catalogueItemId,
    metaProductId,
    created: !isUpdate,
  });

  return { success: true, metaProductId, created: !isUpdate };
}

/**
 * Désynchronise un article du catalogue Meta (stock épuisé ou suppression).
 * Met availability = "out of stock" si épuisé, DELETE si suppression.
 */
export async function unsyncCatalogueItemFromMeta(
  tenantId: string,
  catalogueItemId: string,
  mode: "out_of_stock" | "delete" = "out_of_stock",
): Promise<UnsyncFromMetaResult> {
  if (env.META_CATALOG_SYNC_ENABLED !== "true") {
    return { success: true }; // rien à faire
  }

  const [item, tenant] = await Promise.all([
    db.catalogueItem.findUnique({ where: { id: catalogueItemId } }),
    db.tenant.findUnique({
      where: { id: tenantId },
      select: { metaAccessToken: true },
    }),
  ]);

  // Appartenance vérifiée ici, comme le fait `syncCatalogueItemToMeta`. Les deux
  // fonctions reçoivent `catalogueItemId` et `tenantId` séparément et lisent
  // l'article par son seul `id` : sans ce test, un identifiant appartenant à une
  // autre boutique enverrait son `metaProductId` à Meta, puis remettrait à zéro la
  // synchro de cet article-là. Aucun appelant actuel ne le permet — tous vérifient
  // en amont — mais la jumelle se protégeait déjà et celle-ci non.
  if (!item || item.tenantId !== tenantId) {
    return { success: false, reason: "not_synced" };
  }
  if (!item.metaProductId || !item.syncedToMeta) {
    return { success: false, reason: "not_synced" };
  }
  if (!tenant?.metaAccessToken) {
    return { success: false, reason: "meta_error" };
  }

  const url = `${META_GRAPH_URL}/${item.metaProductId}`;

  if (mode === "delete") {
    const result = await callMetaCommerceApi(
      "DELETE",
      url,
      tenant.metaAccessToken,
      undefined,
      catalogueItemId,
    );
    if (!result.success) return { success: false, reason: "meta_error" };
  } else {
    const result = await callMetaCommerceApi(
      "POST",
      url,
      tenant.metaAccessToken,
      { availability: "out of stock" },
      catalogueItemId,
    );
    if (!result.success) return { success: false, reason: "meta_error" };
  }

  await db.catalogueItem.update({
    where: { id: catalogueItemId },
    data: {
      syncedToMeta: mode === "delete" ? false : true,
      metaProductId: mode === "delete" ? null : item.metaProductId,
      metaSyncedAt: new Date(),
    },
  });

  return { success: true };
}

/**
 * Synchro delta : articles éligibles non encore syncés (appelé par cron).
 * Retourne le nombre d'articles syncés avec succès.
 */
export async function syncPendingCatalogueItems(
  tenantId: string,
): Promise<{ synced: number; failed: number }> {
  const items = await db.catalogueItem.findMany({
    where: {
      tenantId,
      syncedToMeta: false,
      name: { not: null },
      mediaStorageKey: { not: null },
      availableQty: { gt: 0 },
    },
    select: { id: true },
    take: 50, // limite par batch pour éviter le timeout
  });

  let synced = 0;
  let failed = 0;

  for (const { id } of items) {
    const result = await syncCatalogueItemToMeta(tenantId, id);
    if (result.success) {
      synced++;
    } else {
      failed++;
      workerLogger.warn("Failed to sync catalogue item to Meta", {
        tenantId,
        catalogueItemId: id,
        reason: result.reason,
      });
    }
  }

  return { synced, failed };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

type MetaApiResult =
  | { success: true; data: unknown }
  | { success: false; reason: Extract<SyncToMetaResult, { success: false }>["reason"] };

async function callMetaCommerceApi(
  method: "POST" | "DELETE",
  url: string,
  accessToken: string,
  body: Record<string, unknown> | undefined,
  correlationId: string,
  attempt = 1,
): Promise<MetaApiResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.ok) {
      return { success: true, data: await res.json() };
    }

    if (res.status === 429 && attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS * attempt);
      return callMetaCommerceApi(method, url, accessToken, body, correlationId, attempt + 1);
    }

    const errorBody = await res.text();
    workerLogger.error("Meta Commerce API error", {
      status: res.status,
      correlationId,
      body: errorBody,
    });

    if (res.status === 401) return { success: false, reason: "unauthorized" };
    if (res.status === 403) return { success: false, reason: "catalog_not_found" };
    if (res.status === 429) return { success: false, reason: "rate_limited" };
    return { success: false, reason: "meta_error" };
  } catch (error) {
    workerLogger.error("Meta Commerce API fetch failed", error, { correlationId });
    return { success: false, reason: "meta_error" };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
