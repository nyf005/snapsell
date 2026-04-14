/**
 * Télécharge le média depuis mediaUrl et l'upload vers R2 pour une preuve de paiement.
 * Retourne la clé de stockage R2, ou null si R2 non configuré ou en cas d'erreur.
 * Ne modifie aucune table — l'appelant est responsable d'appeler createPaymentProof.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { workerLogger } from "~/lib/logger";
import { isR2Configured, createR2Client, getR2BucketName } from "~/server/media/r2-client";
import { getProviderForTenant } from "~/server/messaging/service";

export async function uploadProofMedia(
  tenantId: string,
  orderId: string,
  mediaUrl: string,
  correlationId: string,
): Promise<string | null> {
  if (!isR2Configured()) return null;

  let resolvedUrl = mediaUrl;
  let metaAccessToken: string | undefined;

  if (mediaUrl.startsWith("meta-media://")) {
    const adapter = await getProviderForTenant(tenantId);
    if (!adapter) {
      workerLogger.warn("No Meta adapter, skipping proof media upload", { correlationId, orderId });
      return null;
    }
    const resolved = await adapter.resolveMediaUrl(mediaUrl, correlationId);
    if (!resolved) {
      workerLogger.warn("Could not resolve meta-media URL for proof", { correlationId, orderId });
      return null;
    }
    resolvedUrl = resolved;
    metaAccessToken = adapter.getAccessToken();
  }

  try {
    new URL(resolvedUrl);
  } catch {
    workerLogger.warn("Invalid resolved mediaUrl for proof, skipping", { correlationId, orderId });
    return null;
  }

  try {
    const fetchHeaders: HeadersInit = metaAccessToken
      ? { Authorization: `Bearer ${metaAccessToken}` }
      : {};
    const response = await fetch(resolvedUrl, { headers: fetchHeaders });
    if (!response.ok) throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";

    const key = `tenants/${tenantId}/payment-proofs/${orderId}/${correlationId}`;
    const client = createR2Client();
    await client.send(
      new PutObjectCommand({
        Bucket: getR2BucketName(),
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    workerLogger.info("Proof media uploaded to R2", { correlationId, tenantId, orderId, key });
    return key;
  } catch (error) {
    workerLogger.error("Error uploading proof media to R2", error, { correlationId, tenantId, orderId });
    return null;
  }
}
