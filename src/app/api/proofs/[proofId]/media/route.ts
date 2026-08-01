/**
 * Story 5.3: Servir l'image d'une preuve d'acompte depuis R2 (sécurisé par tenant).
 * Pas de signed URL publique : le dashboard appelle cette route (session requise).
 */

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { isR2Configured, createR2Client, getR2BucketName } from "~/server/media/r2-client";
import {
  canonicalImageContentType,
  isAllowedImageContentType,
} from "~/server/media/image-content-type";

/**
 * L'écran des preuves ouvre ce média en pleine page derrière un lien, donc sur
 * notre origine et avec la session de la vendeuse. Ce qui sort d'ici ne doit
 * jamais pouvoir s'exécuter — l'upload valide déjà le type, ceci couvre les
 * preuves stockées avant cette validation.
 */
const INERT_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Content-Disposition": "inline",
} as const;

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
    const client = createR2Client();

    const result = await client.send(
      new GetObjectCommand({
        Bucket: getR2BucketName(),
        Key: proof.mediaStorageKey,
      }),
    );

    if (!result.Body) {
      return NextResponse.json({ error: "Média vide" }, { status: 404 });
    }

    if (!isAllowedImageContentType(result.ContentType)) {
      return NextResponse.json(
        { error: "Média indisponible" },
        { status: 415, headers: INERT_HEADERS },
      );
    }

    const bytes = await result.Body.transformToByteArray();
    const contentType = canonicalImageContentType(result.ContentType!);

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        ...INERT_HEADERS,
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
