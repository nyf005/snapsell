/**
 * Proxy R2 permanent pour les images catalogue.
 * Remplace les URLs signées (expirent en 1h) par des URLs permanentes exploitables par Meta.
 *
 * Route : GET /api/media/tenants/{tenantId}/catalogue-items/{itemId}/photo
 *       : GET /api/media/tenants/{tenantId}/live-items/{itemId}/media
 *
 * - Aucune auth requise (Meta doit pouvoir fetch l'URL sans session).
 * - Validation stricte du chemin pour éviter tout accès arbitraire à R2.
 * - Cache-Control public 24h côté client ; pas de cache côté Next.js (CDN gère).
 */

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { isR2Configured, createR2Client, getR2BucketName } from "~/server/media/r2-client";

/** Chemins R2 autorisés (whitelist stricte). */
const ALLOWED_KEY_PATTERN =
  /^tenants\/[^/]+\/(?:catalogue-items|live-items)\/[^/]+\/[^/]+$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: segments } = await params;

  if (!segments?.length) {
    return NextResponse.json({ error: "Clé manquante" }, { status: 400 });
  }

  const storageKey = segments.join("/");

  if (!ALLOWED_KEY_PATTERN.test(storageKey)) {
    return NextResponse.json({ error: "Chemin non autorisé" }, { status: 403 });
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
        Key: storageKey,
      }),
    );

    if (!result.Body) {
      return NextResponse.json({ error: "Média introuvable" }, { status: 404 });
    }

    const bytes = await result.Body.transformToByteArray();
    const contentType = result.ContentType ?? "image/jpeg";

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
      },
    });
  } catch (err: unknown) {
    const isNotFound =
      err instanceof Error && err.name === "NoSuchKey";

    if (isNotFound) {
      return NextResponse.json({ error: "Média introuvable" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Erreur lors de la récupération du média" },
      { status: 500 },
    );
  }
}
