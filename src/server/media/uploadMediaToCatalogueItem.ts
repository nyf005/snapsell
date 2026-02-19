/**
 * Story 9.3: Télécharger le média, uploader vers R2, enregistrer la clé sur CatalogueItem.
 * Exécuté en async (ne pas bloquer le worker).
 * Si R2 non configuré, no-op.
 * En cas d'échec (fetch, upload, update), l'appelant gère via .catch (fire-and-forget).
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";
import { isR2Configured, createR2Client, getR2BucketName } from "~/server/media/r2-client";

/**
 * Télécharge le média depuis mediaUrl, upload vers R2,
 * met à jour CatalogueItem.mediaStorageKey. No-op si R2 non configuré.
 */
export async function uploadMediaToCatalogueItem(
  tenantId: string,
  catalogueItemId: string,
  mediaUrl: string,
  correlationId: string,
): Promise<void> {
  if (!isR2Configured()) {
    workerLogger.debug("R2 not configured, skipping catalogue media upload", {
      correlationId,
      catalogueItemId,
    });
    return;
  }

  // Valider que mediaUrl est une URL valide
  try {
    new URL(mediaUrl);
  } catch {
    workerLogger.warn("Invalid mediaUrl, skipping catalogue upload", {
      correlationId,
      catalogueItemId,
      mediaUrl: mediaUrl.slice(0, 80),
    });
    return;
  }

  try {
    // 1. Fetch media
    const response = await fetch(mediaUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch media: ${response.status} ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";

    // L2: Valider content-type (accepter uniquement images)
    const ALLOWED_CONTENT_TYPES = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/heic",
      "image/heif",
    ];
    if (!ALLOWED_CONTENT_TYPES.some((t) => contentType.startsWith(t))) {
      workerLogger.warn("Unsupported content-type for catalogue media, skipping upload", {
        correlationId,
        catalogueItemId,
        contentType,
      });
      return;
    }

    // L3: Limiter la taille du buffer (10 Mo max)
    const MAX_BUFFER_SIZE = 10 * 1024 * 1024;
    if (buffer.length > MAX_BUFFER_SIZE) {
      workerLogger.warn("Media too large for catalogue upload, skipping", {
        correlationId,
        catalogueItemId,
        size: buffer.length,
        maxSize: MAX_BUFFER_SIZE,
      });
      return;
    }

    // 2. Upload to R2
    const key = `tenants/${tenantId}/catalogue-items/${catalogueItemId}/photo`;
    const client = createR2Client();

    await client.send(
      new PutObjectCommand({
        Bucket: getR2BucketName(),
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    // 3. Update DB
    await db.catalogueItem.update({
      where: { id: catalogueItemId, tenantId },
      data: { mediaStorageKey: key },
    });

    workerLogger.info("Media uploaded to R2 and linked to CatalogueItem", {
      correlationId,
      tenantId,
      catalogueItemId,
      key,
    });
  } catch (error) {
    workerLogger.error("Error uploading media to R2 and linking to CatalogueItem", error, {
      correlationId,
      tenantId,
      catalogueItemId,
      mediaUrl: mediaUrl.slice(0, 80),
    });
    throw error;
  }
}
