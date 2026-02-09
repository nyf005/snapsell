/**
 * Story 5.3: Servir l'image d'une preuve d'acompte depuis R2 (sécurisé par tenant).
 * Pas de signed URL publique : le dashboard appelle cette route (session requise).
 */

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { env } from "~/env";

function isR2Configured(): boolean {
  return !!(
    env.R2_ACCOUNT_ID &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY &&
    env.R2_BUCKET_NAME
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ proofId: string }> },
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { proofId } = await params;
  if (!proofId) {
    return NextResponse.json({ error: "proofId requis" }, { status: 400 });
  }

  const proof = await db.paymentProof.findFirst({
    where: { id: proofId, tenantId: session.user.tenantId },
    select: { mediaStorageKey: true },
  });

  if (!proof?.mediaStorageKey) {
    return NextResponse.json({ error: "Preuve ou média introuvable" }, { status: 404 });
  }

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Stockage média non configuré" },
      { status: 503 },
    );
  }

  try {
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

    const result = await client.send(
      new GetObjectCommand({
        Bucket: env.R2_BUCKET_NAME!,
        Key: proof.mediaStorageKey,
      }),
    );

    if (!result.Body) {
      return NextResponse.json({ error: "Média vide" }, { status: 404 });
    }

    const bytes = await result.Body.transformToByteArray();
    const contentType = result.ContentType ?? "application/octet-stream";

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Erreur lors de la récupération du média" },
      { status: 500 },
    );
  }
}
