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
 *
 * ── CE QUI SORT D'ICI NE PEUT PAS S'EXÉCUTER ────────────────────────────────
 *
 * Cette route est publique et sert depuis l'origine de l'application. Elle
 * réémettait le `Content-Type` stocké dans R2 sans le questionner, alors que le
 * chemin d'upload live n'en validait aucun : un document HTML arrivé par
 * WhatsApp devenait du script exécutable sur notre propre origine, avec accès
 * à tout ce qu'une session ouverte permet.
 *
 * Les deux chemins d'upload valident désormais le type — mais un objet déposé
 * avant ce correctif est toujours dans le bucket. La défense est donc doublée
 * ici, à la sortie, et ne dépend pas de ce qui a été écrit :
 *
 *   1. le type stocké est reconfronté à la même liste, sinon rien n'est servi ;
 *   2. `nosniff` interdit au navigateur de deviner un type plus permissif ;
 *   3. `sandbox` et `default-src 'none'` neutralisent la réponse même si un
 *      document parvenait malgré tout à être interprété.
 *
 * Il n'y a volontairement pas de contrôle de tenant : Meta doit pouvoir
 * récupérer l'image sans session, c'est la raison d'être de cette route. La
 * confidentialité repose sur l'imprévisibilité des identifiants — acceptable
 * pour des photos d'articles destinées à être diffusées, et les preuves de
 * paiement vivent hors de ce préfixe (`payment-proofs`), servies par une route
 * authentifiée.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { isR2Configured, createR2Client, getR2BucketName } from "~/server/media/r2-client";
import {
  MAX_MEDIA_BYTES,
  canonicalImageContentType,
  isAllowedImageContentType,
} from "~/server/media/image-content-type";
import { workerLogger } from "~/lib/logger";

/** Chemins R2 autorisés (whitelist stricte). */
const ALLOWED_KEY_PATTERN =
  /^tenants\/[^/]+\/(?:catalogue-items|live-items)\/[^/]+\/[^/]+$/;

/** En-têtes neutralisant toute interprétation active de la réponse. */
const INERT_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Content-Disposition": "inline",
} as const;

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

    // Le type par défaut était `image/jpeg`, ce qui revenait à affirmer une
    // nature qu'on n'avait pas vérifiée. Un objet sans type déclaré est
    // désormais refusé comme n'importe quel type non conforme.
    if (!isAllowedImageContentType(result.ContentType)) {
      workerLogger.warn("Média R2 au type non servable — refus", {
        storageKey,
        contentType: result.ContentType ?? "(absent)",
      });
      return NextResponse.json(
        { error: "Média indisponible" },
        { status: 415, headers: INERT_HEADERS },
      );
    }

    // Garde-fou mémoire : la réponse est mise en tampon avant d'être renvoyée,
    // et un objet démesuré la ferait porter à l'instance entière. Les uploads
    // sont déjà plafonnés à la même valeur ; ceci couvre ce qui a été écrit
    // avant ce plafond.
    if (result.ContentLength != null && result.ContentLength > MAX_MEDIA_BYTES) {
      workerLogger.warn("Média R2 trop volumineux — refus", {
        storageKey,
        size: result.ContentLength,
        maxSize: MAX_MEDIA_BYTES,
      });
      return NextResponse.json(
        { error: "Média indisponible" },
        { status: 413, headers: INERT_HEADERS },
      );
    }

    const bytes = await result.Body.transformToByteArray();
    const contentType = canonicalImageContentType(result.ContentType!);

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        ...INERT_HEADERS,
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
