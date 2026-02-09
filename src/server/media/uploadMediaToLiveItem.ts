/**
 * Story 3.4: Télécharger le média Twilio, uploader vers R2, enregistrer la clé sur LiveItem.
 * Exécuté en async (ne pas bloquer le worker).
 * Si R2 ou Twilio non configurés, no-op.
 * En cas d'échec (fetch, upload, update), l'item reste sans mediaStorageKey ; pas de retry/DLQ dédié (MVP).
 */

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "~/env";
import { db } from "~/server/db";
import { workerLogger } from "~/lib/logger";

function isR2Configured(): boolean {
  return !!(
    env.R2_ACCOUNT_ID &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY &&
    env.R2_BUCKET_NAME
  );
}

/**
 * Télécharge le média depuis mediaUrl (Twilio avec auth si besoin), upload vers R2,
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

  // Valider que mediaUrl est une URL valide (évite fetch vers chaîne arbitraire)
  try {
    new URL(mediaUrl);
  } catch {
    workerLogger.warn("Invalid mediaUrl, skipping upload", {
      correlationId,
      liveItemId,
      mediaUrl: mediaUrl.slice(0, 80),
    });
    return;
  }

  try {
    const isTwilioUrl = mediaUrl.includes("api.twilio.com") || mediaUrl.includes("twilio.com");
    const accountSid = env.TWILIO_ACCOUNT_SID;
    const authToken = env.TWILIO_AUTH_TOKEN;
    const headers: HeadersInit = {};
    if (isTwilioUrl && accountSid && authToken) {
      headers["Authorization"] =
        "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    }

    const response = await fetch(mediaUrl, { headers });
    if (!response.ok) {
      throw new Error(`Failed to fetch media: ${response.status} ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";

    const key = `tenants/${tenantId}/live-items/${liveItemId}/media`;
    const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const client = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true,
    });

    await client.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME!,
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
      mediaUrl: mediaUrl.slice(0, 80),
    });
    throw error;
  }
}
