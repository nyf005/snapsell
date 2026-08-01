/**
 * Story 9.2 Task 1: API route upload/serve/delete photo catalogue
 * POST — upload photo vers R2, met à jour mediaStorageKey
 * GET  — sert l'image depuis R2 (session requise)
 * DELETE — met mediaStorageKey à null
 */

import { NextResponse } from "next/server";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { isR2Configured, createR2Client, getR2BucketName } from "~/server/media/r2-client";
import {
  canonicalImageContentType,
  isAllowedImageContentType,
} from "~/server/media/image-content-type";

/**
 * Liste propre au téléversement depuis le dashboard, volontairement plus étroite
 * que celle du stockage : c'est elle qu'énonce le message d'erreur affiché.
 */
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/** Ce qui sort d'ici ne doit pas pouvoir s'exécuter — cf. `/api/media`. */
const INERT_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Content-Disposition": "inline",
} as const;

type RouteContext = { params: Promise<{ itemId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Stockage média non configuré" },
      { status: 503 },
    );
  }

  const { itemId } = await context.params;
  const tenantId = session.user.tenantId;

  // Verify item belongs to tenant
  const item = await db.catalogueItem.findFirst({
    where: { id: itemId, tenantId },
    select: { id: true },
  });

  if (!item) {
    return NextResponse.json({ error: "Article non trouvé" }, { status: 404 });
  }

  // Parse form data
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
  }

  // Validate file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Type de fichier non autorisé. Acceptés : JPEG, PNG, WebP" },
      { status: 400 },
    );
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "Taille maximale dépassée (5 MB)" },
      { status: 400 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = `tenants/${tenantId}/catalogue-items/${itemId}/photo`;

    const client = createR2Client();
    await client.send(
      new PutObjectCommand({
        Bucket: getR2BucketName(),
        Key: key,
        Body: buffer,
        ContentType: file.type,
      }),
    );

    await db.catalogueItem.update({
      where: { id: itemId },
      data: { mediaStorageKey: key },
    });

    return NextResponse.json({ success: true, mediaStorageKey: key });
  } catch {
    return NextResponse.json(
      { error: "Erreur lors de l'upload" },
      { status: 500 },
    );
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { itemId } = await context.params;
  const tenantId = session.user.tenantId;

  const item = await db.catalogueItem.findFirst({
    where: { id: itemId, tenantId },
    select: { mediaStorageKey: true },
  });

  if (!item?.mediaStorageKey) {
    return NextResponse.json({ error: "Photo non trouvée" }, { status: 404 });
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
        Key: item.mediaStorageKey,
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

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { itemId } = await context.params;
  const tenantId = session.user.tenantId;

  const item = await db.catalogueItem.findFirst({
    where: { id: itemId, tenantId },
    select: { id: true },
  });

  if (!item) {
    return NextResponse.json({ error: "Article non trouvé" }, { status: 404 });
  }

  await db.catalogueItem.update({
    where: { id: itemId },
    data: { mediaStorageKey: null },
  });

  return NextResponse.json({ success: true });
}
