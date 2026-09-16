/**
 * Story 9.2: Module partagé R2 — S3Client factory et utilitaires.
 * Extrait de uploadMediaToLiveItem.ts et proofs/[proofId]/media/route.ts pour éviter duplication.
 */

import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { db } from "~/server/db";
import type { Prisma } from "../../../generated/prisma";
import { env } from "~/env";
import { createLogger } from "~/lib/logger";

const mediaLogger = createLogger("Media");

export function isR2Configured(): boolean {
  return !!(
    env.R2_ACCOUNT_ID &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY &&
    env.R2_BUCKET_NAME
  );
}

export function createR2Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
  });
}

export function getR2BucketName(): string {
  return env.R2_BUCKET_NAME!;
}

/** Sérialise le retrait d'un objet et la copie de sa référence vers le live. */
export async function withMediaLock<T>(key: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    return work(tx);
  }, { timeout: 15_000 });
}

/** Seul le propriétaire peut supprimer une photo, et uniquement sans référence restante. */
export async function deleteR2ObjectBestEffort(tenantId: string, itemId: string, key: string): Promise<boolean> {
  const prefix = `tenants/${tenantId}/catalogue-items/${itemId}/`;
  if (!key.startsWith(prefix) || !/^photo(?:s\/[a-f0-9-]{36})?$/.test(key.slice(prefix.length))) return false;
  if (!isR2Configured()) return false;
  try {
    return await withMediaLock(key, async tx => {
      const refs = await Promise.all([
        tx.catalogueItem.count({ where: { mediaStorageKey: key } }),
        tx.liveItem.count({ where: { mediaStorageKey: key } }),
        tx.paymentProof.count({ where: { mediaStorageKey: key } }),
        tx.reservation.count({ where: { catalogueItemId: itemId } }),
      ]);
      if (refs.some(Boolean)) return false;
      await createR2Client().send(new DeleteObjectCommand({ Bucket: getR2BucketName(), Key: key }),
        { abortSignal: AbortSignal.timeout(5000) });
      return true;
    });
  } catch {
    mediaLogger.warn("Objet R2 non supprimé, à nettoyer", { key });
    return false;
  }
}
