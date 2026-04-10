/**
 * Story 3.4: Télécharger le média, uploader vers R2, enregistrer la clé sur LiveItem.
 * Exécuté en async (ne pas bloquer le worker).
 * Si R2 non configuré, no-op.
 * En cas d'échec (fetch, upload, update), l'item reste sans mediaStorageKey ; pas de retry/DLQ dédié (MVP).
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";
import { isR2Configured, createR2Client, getR2BucketName } from "~/server/media/r2-client";
import { resolveMetaMediaUrl } from "~/server/media/resolve-meta-media";
import { decrypt } from "~/lib/crypto";

/**
 * Télécharge le média depuis mediaUrl, upload vers R2,
 * met à jour LiveItem.mediaStorageKey. No-op si R2 non configuré.
 */
export async function uploadMediaAndLinkToLiveItem(
  tenantId: string,
  liveItemId: string,
  mediaUrl: string,
  correlationId: string,
): Promise<void> {
  if (!isR2Configured()) {
    workerLogger.debug("R2 not configured, skipping media upload", {
      correlationId,
      liveItemId,
    });
    return;
  }

  // Résoudre meta-media:// → URL HTTPS téléchargeable via Meta Graph API
  let resolvedUrl = mediaUrl;
  if (mediaUrl.startsWith("meta-media://")) {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { metaAccessToken: true },
    });
    if (!tenant?.metaAccessToken) {
      workerLogger.warn("No Meta access token, skipping live item media upload", { correlationId, liveItemId });
      return;
    }
    const resolved = await resolveMetaMediaUrl(mediaUrl, decrypt(tenant.metaAccessToken), correlationId);
    if (!resolved) {
      workerLogger.warn("Could not resolve meta-media URL, skipping live item upload", { correlationId, liveItemId });
      return;
    }
    resolvedUrl = resolved;
  }

  // Valider que l'URL résolue est bien une URL HTTP(S) valide
  try {
    new URL(resolvedUrl);
  } catch {
    workerLogger.warn("Invalid resolved mediaUrl, skipping upload", {
      correlationId,
      liveItemId,
      mediaUrl: resolvedUrl.slice(0, 80),
    });
    return;
  }

  try {
    const response = await fetch(resolvedUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch media: ${response.status} ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";

    const key = `tenants/${tenantId}/live-items/${liveItemId}/media`;
    const client = createR2Client();

    await client.send(
      new PutObjectCommand({
        Bucket: getR2BucketName(),
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    await db.liveItem.update({
      where: { id: liveItemId, tenantId },
      data: { mediaStorageKey: key },
    });

    workerLogger.info("Media uploaded to R2 and linked to LiveItem", {
      correlationId,
      tenantId,
      liveItemId,
      key,
    });
  } catch (error) {
    workerLogger.error("Error uploading media to R2 and linking to LiveItem", error, {
      correlationId,
      tenantId,
      liveItemId,
      mediaUrl: resolvedUrl.slice(0, 80),
    });
    throw error;
  }
}
