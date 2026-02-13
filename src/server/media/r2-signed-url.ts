/**
 * Story 9.4: Génération d'URL signées R2 pour les photos catalogue.
 * Utilise @aws-sdk/s3-request-presigner + GetObjectCommand.
 * Réutilise createR2Client() et getR2BucketName() de r2-client.ts.
 */

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { workerLogger } from "~/lib/logger";
import { isR2Configured, createR2Client, getR2BucketName } from "./r2-client";

const SIGNED_URL_EXPIRATION_SECONDS = 3600; // 1h

/**
 * Génère une URL signée R2 pour un objet stocké.
 * @param storageKey - Clé R2 (ex. "tenants/{tid}/catalogue-items/{iid}/photo")
 * @param correlationId - Pour traçabilité des erreurs
 * @returns URL signée ou null si R2 non configuré / erreur
 */
export async function generateSignedR2Url(
  storageKey: string,
  correlationId: string,
): Promise<string | null> {
  if (!isR2Configured()) {
    workerLogger.debug("R2 not configured, skipping signed URL generation", {
      correlationId,
    });
    return null;
  }

  try {
    const client = createR2Client();
    const bucket = getR2BucketName();

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    });

    const signedUrl = await getSignedUrl(client, command, {
      expiresIn: SIGNED_URL_EXPIRATION_SECONDS,
    });

    return signedUrl;
  } catch (error) {
    workerLogger.error("Error generating signed R2 URL", error, {
      correlationId,
      storageKey,
    });
    return null;
  }
}
