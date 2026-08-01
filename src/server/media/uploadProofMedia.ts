/**
 * Télécharge le média depuis mediaUrl et l'upload vers R2 pour une preuve de paiement.
 * Retourne la clé de stockage R2, ou null si R2 non configuré ou en cas d'erreur.
 * Ne modifie aucune table — l'appelant est responsable d'appeler createPaymentProof.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { workerLogger } from "~/lib/logger";
import { isR2Configured, createR2Client, getR2BucketName } from "~/server/media/r2-client";
import {
  MAX_MEDIA_BYTES,
  canonicalImageContentType,
  isAllowedImageContentType,
} from "~/server/media/image-content-type";
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
    const rawContentType = response.headers.get("content-type") ?? "application/octet-stream";

    /**
     * Une preuve vient d'une **cliente**, pas d'une vendeuse : c'est le contenu
     * le moins fiable qui entre dans le produit. Et l'écran des preuves ne se
     * contente pas de l'afficher en vignette, il l'expose aussi derrière un lien
     * qui l'ouvre en plein écran — une navigation vers notre propre origine,
     * avec la session de la vendeuse. Un « justificatif » en HTML s'y serait
     * exécuté.
     *
     * On refuse donc tout ce qui n'est pas une image. La preuve n'est pas perdue
     * pour autant : `createPaymentProof` enregistre la ligne sans média, et la
     * vendeuse voit la preuve arriver avec la mention « image indisponible ».
     */
    if (!isAllowedImageContentType(rawContentType)) {
      workerLogger.warn("Type de média non autorisé pour une preuve, upload ignoré", {
        correlationId,
        orderId,
        contentType: rawContentType,
      });
      return null;
    }
    const contentType = canonicalImageContentType(rawContentType);

    if (buffer.length > MAX_MEDIA_BYTES) {
      workerLogger.warn("Média de preuve trop volumineux, upload ignoré", {
        correlationId,
        orderId,
        size: buffer.length,
        maxSize: MAX_MEDIA_BYTES,
      });
      return null;
    }

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
