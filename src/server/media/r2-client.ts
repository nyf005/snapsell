/**
 * Story 9.2: Module partagé R2 — S3Client factory et utilitaires.
 * Extrait de uploadMediaToLiveItem.ts et proofs/[proofId]/media/route.ts pour éviter duplication.
 */

import { S3Client } from "@aws-sdk/client-s3";
import { env } from "~/env";

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
