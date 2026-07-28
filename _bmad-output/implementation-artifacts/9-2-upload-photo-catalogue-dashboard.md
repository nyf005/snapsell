# Story 9.2: Upload photo catalogue via Dashboard

Status: done

<!-- Infrastructure R2 et champ mediaStorageKey déjà en place (Stories 3.4, 5.3, 8.1). Cette story ajoute l'upload direct depuis le dashboard et l'affichage des photos dans le catalogue. -->

## Story

As a **vendeur**,
I want **ajouter une photo à un article du catalogue depuis le dashboard**,
so that **mes clientes voient le produit et que ma boutique soit plus attractive**.

## Acceptance Criteria

1. **Given** je suis connecté au dashboard et je crée un article catalogue
   **When** je sélectionne une photo (image) dans le formulaire de création
   **Then** l'article est créé avec la photo stockée sur R2 et `mediaStorageKey` renseigné
   **And** la photo est visible dans la liste du catalogue (thumbnail)

2. **Given** un article catalogue existant sans photo
   **When** je clique sur "Modifier" et j'ajoute une photo
   **Then** la photo est uploadée sur R2 et `mediaStorageKey` mis à jour
   **And** la photo apparaît dans la liste et dans le formulaire d'édition

3. **Given** un article catalogue existant avec photo
   **When** je clique sur "Modifier" et je supprime la photo (bouton supprimer)
   **Then** `mediaStorageKey` est mis à null (l'objet R2 peut rester pour le moment)
   **And** la liste n'affiche plus de thumbnail pour cet article

4. **Given** un article catalogue existant avec photo
   **When** je clique sur "Modifier" et je sélectionne une nouvelle photo
   **Then** la nouvelle photo remplace l'ancienne sur R2 (même clé) et l'affichage est mis à jour

5. **Given** R2 n'est pas configuré (env vars absentes)
   **When** je crée ou modifie un article avec une photo
   **Then** l'upload est ignoré gracieusement (pas de crash), l'article est créé/modifié sans photo
   **And** le champ upload est masqué ou désactivé avec un message explicatif

6. **Given** je sélectionne un fichier non image ou trop volumineux (> 5 MB)
   **When** je soumets le formulaire
   **Then** une erreur de validation claire est affichée (type de fichier, taille max)
   **And** le formulaire ne se soumet pas

7. **Given** la liste du catalogue avec des articles ayant des photos
   **When** je consulte la liste
   **Then** je vois un thumbnail (petite image) pour chaque article ayant une photo
   **And** je peux cliquer sur le thumbnail pour voir la photo en plus grand

## Tasks / Subtasks

- [x] Task 1 : API route upload photo catalogue (AC: #1, #2, #4, #5, #6)
  - [x] Créer `src/app/api/catalogue/[itemId]/photo/route.ts` — POST (upload) + GET (serve) + DELETE (remove)
  - [x] POST : valider auth session + tenant isolation + file type (image/*) + taille (max 5 MB)
  - [x] POST : upload vers R2 avec clé `tenants/{tenantId}/catalogue-items/{itemId}/photo`
  - [x] POST : mettre à jour `CatalogueItem.mediaStorageKey` en DB
  - [x] GET : servir l'image depuis R2 (même pattern que `/api/proofs/[proofId]/media`)
  - [x] DELETE : mettre `mediaStorageKey` à null en DB
  - [x] Gérer le cas R2 non configuré (retourner erreur 501 ou skip gracieux)

- [x] Task 2 : Modifier le formulaire catalogue pour supporter la photo (AC: #1, #2, #3, #4, #6)
  - [x] Ajouter un composant file input avec aperçu dans `catalogue-item-form-dialog.tsx`
  - [x] En mode création : après création réussie de l'item, upload la photo vers `/api/catalogue/{id}/photo`
  - [x] En mode édition : afficher la photo existante (si `mediaStorageKey`) avec options "Changer" / "Supprimer"
  - [x] Validation client : accepter uniquement image/jpeg, image/png, image/webp ; max 5 MB
  - [x] État de chargement pendant l'upload (spinner/progress)

- [x] Task 3 : Afficher les photos dans la liste catalogue (AC: #7)
  - [x] Modifier `catalogue-list-content.tsx` pour afficher un thumbnail si `mediaStorageKey` est présent
  - [x] Utiliser le pattern existant des proofs : `<img src="/api/catalogue/{id}/photo" />`
  - [x] Thumbnail cliquable pour voir en grand (lightbox simple ou ouverture nouvel onglet)

- [x] Task 4 : Indicateur R2 non configuré (AC: #5)
  - [x] Créer une route tRPC ou API pour exposer si R2 est configuré (sans révéler les credentials)
  - [x] Masquer ou désactiver le champ photo dans le formulaire si R2 non configuré
  - [x] Message explicatif : "Configuration R2 requise pour les photos"

- [x] Task 5 : Tests (AC: #1–#7)
  - [x] Tests unitaires API route : upload, serve, delete, validation type/taille, tenant isolation, R2 non configuré (18 tests)
  - [x] Tests du formulaire (si pattern de test UI existe dans le projet) — N/A : pas de @testing-library dans le projet
  - [x] Vérifier que la liste affiche correctement les thumbnails — N/A : pas de pattern test UI
  - [x] Tester le flux complet : créer article + photo, éditer photo, supprimer photo — couvert par tests API route + r2Status

## Dev Notes

### Architecture de l'upload

**Flux création :**
1. Utilisateur remplit le formulaire (code, quantité, prix, photo)
2. Clic "Créer" → appel tRPC `catalogue.create` (sans photo) → récupère l'ID de l'item créé
3. Si photo sélectionnée → POST `/api/catalogue/{itemId}/photo` avec FormData
4. Rafraîchir la liste (invalidate query tRPC)

**Flux édition :**
1. Formulaire pré-rempli avec données existantes + aperçu photo si `mediaStorageKey`
2. Si nouvelle photo sélectionnée → POST `/api/catalogue/{itemId}/photo` (écrase l'existante, même clé R2)
3. Si "Supprimer photo" → DELETE `/api/catalogue/{itemId}/photo`
4. Si autres champs modifiés → appel tRPC `catalogue.update`

**Raison du choix item-specific vs generic upload :**
- Pas d'orphelins R2 (photo toujours liée à un item existant)
- Tenant isolation garantie par l'API route (vérification ownership)
- Clé R2 déterministe = remplacement simple

### Clé de stockage R2

Pattern : `tenants/{tenantId}/catalogue-items/{itemId}/photo`

Cohérent avec le pattern LiveItem : `tenants/{tenantId}/live-items/{liveItemId}/media`

### Infrastructure existante à réutiliser

| Composant | Fichier source | Ce qu'on réutilise |
|-----------|---------------|-------------------|
| S3Client setup | `src/server/media/uploadMediaToLiveItem.ts` | Pattern S3Client (endpoint, credentials, PutObjectCommand) |
| isR2Configured() | `src/server/media/uploadMediaToLiveItem.ts` | Vérification config R2 |
| Serving route | `src/app/api/proofs/[proofId]/media/route.ts` | Pattern exact : session auth + GetObjectCommand + Content-Type |
| Image display | `src/app/(dashboard)/dashboard/proofs/_components/proofs-list-content.tsx` | Pattern thumbnail + clic pour agrandir |
| Zod schemas | `src/server/api/routers/catalogue.schema.ts` | `mediaStorageKey` déjà accepté dans create/update |
| tRPC mutations | `src/server/api/routers/catalogue.ts` | `mediaStorageKey` déjà géré dans create (L71) et update (L142-144) |

### Pattern S3Client (à extraire ou copier)

```typescript
// Pattern existant dans uploadMediaToLiveItem.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { env } from "~/env";

function createR2Client() {
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
```

**Recommendation :** Extraire `createR2Client()` et `isR2Configured()` dans un module partagé `src/server/media/r2-client.ts` (si pas déjà fait) pour éviter la duplication. Sinon, copier le pattern dans l'API route.

### Validation fichier

```typescript
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
```

### Sécurité

- **Auth obligatoire** : session NextAuth requise sur toutes les routes
- **Tenant isolation** : vérifier que `CatalogueItem.tenantId === session.user.tenantId` avant upload/serve/delete
- **Content-Type** : valider le type MIME du fichier uploadé (pas seulement l'extension)
- **Taille** : rejeter les fichiers > 5 MB côté client ET côté serveur
- **Pas de noms de fichiers utilisateur** : la clé R2 est déterministe (pas d'injection de path)

### Next.js App Router — File Upload Pattern

Dans un API route App Router, le fichier est lu via `request.formData()` :

```typescript
export async function POST(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Fichier requis" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  // ... validation + upload R2
}
```

### Fichiers impactés

| Fichier | Action |
|---------|--------|
| `src/app/api/catalogue/[itemId]/photo/route.ts` | **Nouveau** — POST (upload), GET (serve), DELETE (remove) |
| `src/app/(dashboard)/dashboard/catalogue/_components/catalogue-item-form-dialog.tsx` | **Modifier** — ajouter file input + aperçu photo |
| `src/app/(dashboard)/dashboard/catalogue/_components/catalogue-list-content.tsx` | **Modifier** — ajouter thumbnail photo |
| `src/server/media/r2-client.ts` | **Nouveau (optionnel)** — extraire S3Client partagé si nécessaire |

### Project Structure Notes

- La route API `/api/catalogue/[itemId]/photo` suit le pattern existant `/api/proofs/[proofId]/media`
- Les composants catalogue restent dans `src/app/(dashboard)/dashboard/catalogue/_components/`
- Pas de nouveau modèle Prisma nécessaire — `mediaStorageKey` existe déjà sur `CatalogueItem`
- Pas de nouvelle migration Prisma nécessaire

### Leçons de la story 9-1

- Prisma validate + generate après toute modification schéma (ici : pas de modification nécessaire)
- Tests existants : 504 passent. S'assurer de ne rien casser.
- Pattern de test : mocks Prisma dans les fichiers `*.test.ts` co-localisés

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 9, Story 9.2]
- [Source: _bmad-output/planning-artifacts/architecture.md — §8 Data Storage, §11 Deployment, Cloudflare R2]
- [Source: src/server/media/uploadMediaToLiveItem.ts — Pattern upload R2 existant]
- [Source: src/app/api/proofs/[proofId]/media/route.ts — Pattern serving media existant]
- [Source: src/app/(dashboard)/dashboard/proofs/_components/proofs-list-content.tsx — Pattern affichage thumbnail]
- [Source: src/server/api/routers/catalogue.ts — Mutations create/update avec mediaStorageKey]
- [Source: src/server/api/routers/catalogue.schema.ts — Zod schemas avec mediaStorageKey]
- [Source: prisma/schema.prisma — CatalogueItem.mediaStorageKey (L371)]
- [Source: _bmad-output/implementation-artifacts/9-1-refactorer-catalogue-session-sentinel.md — Story précédente, leçons]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Aucun problème bloquant rencontré.

### Completion Notes List

- **Task 1** : Créé API route `/api/catalogue/[itemId]/photo` avec POST (upload R2), GET (serve), DELETE (set null). Extrait `r2-client.ts` module partagé pour éviter duplication isR2Configured/createR2Client. 18 tests unitaires couvrant auth, tenant isolation, validation type/taille, R2 non configuré.
- **Task 2** : Formulaire catalogue enrichi avec file input, aperçu photo, validation client (JPEG/PNG/WebP, 5 MB), flux création en 2 étapes (create item → upload photo), flux édition avec change/delete photo, spinner pendant upload.
- **Task 3** : Colonne "Photo" ajoutée dans la table catalogue avec thumbnail 40x40 cliquable (ouvre nouvel onglet). Placeholder `ImageOff` si pas de photo.
- **Task 4** : Query tRPC `catalogue.r2Status` exposant si R2 est configuré (sans credentials). Prop `r2Configured` passée au formulaire, section photo masquée avec message explicatif si R2 non configuré. 2 tests unitaires.
- **Task 5** : 20 tests au total (18 API route + 2 r2Status). Tests UI N/A (pas de @testing-library dans le projet).

### Implementation Plan

- Flux création : form → tRPC create → POST /api/catalogue/{id}/photo → invalidate query
- Flux édition : DELETE ou POST photo → tRPC update si champs modifiés → invalidate query
- Clé R2 déterministe : `tenants/{tenantId}/catalogue-items/{itemId}/photo`
- Module partagé `r2-client.ts` pour S3Client factory

### File List

- `src/server/media/r2-client.ts` — **Nouveau** : module partagé R2 (isR2Configured, createR2Client, getR2BucketName)
- `src/app/api/catalogue/[itemId]/photo/route.ts` — **Nouveau** : API route POST/GET/DELETE photo catalogue
- `src/app/api/catalogue/[itemId]/photo/route.test.ts` — **Nouveau** : 18 tests unitaires API route
- `src/app/(dashboard)/dashboard/catalogue/_components/catalogue-item-form-dialog.tsx` — **Modifié** : file input, aperçu, upload/delete photo, prop r2Configured
- `src/app/(dashboard)/dashboard/catalogue/_components/catalogue-list-content.tsx` — **Modifié** : colonne thumbnail, query r2Status, prop r2Configured au formulaire
- `src/server/api/routers/catalogue.ts` — **Modifié** : ajout query r2Status + import r2-client
- `src/server/api/routers/catalogue.test.ts` — **Modifié** : ajout 2 tests r2Status

## Change Log

- 2026-02-12 : Story 9.2 implémentée — upload photo catalogue via dashboard (5 tasks, 20 tests, 7 fichiers)
- 2026-02-12 : Code review — 7 findings corrigés (1 HIGH, 3 MEDIUM, 3 LOW). Refactoring R2 consolidé, bugs formulaire fixés, tests nettoyés. 523 tests passent.
