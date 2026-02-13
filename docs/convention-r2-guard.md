# Convention : R2 Guard Pattern

## Quand utiliser `isR2Configured()`

Tout code qui touche au stockage média (upload, download, suppression, signed URLs) **doit** vérifier `isR2Configured()` avant d'interagir avec R2. Cela permet un fonctionnement gracieux en développement local ou quand les variables R2 ne sont pas configurées.

## Pattern

```ts
import { isR2Configured, createR2Client, getR2BucketName } from "~/server/media/r2-client";

// Worker / background job : skip silencieux
if (!isR2Configured()) {
  workerLogger.debug("R2 not configured, skipping media upload", { correlationId });
  return;
}

// API route : réponse 503 explicite
if (!isR2Configured()) {
  return NextResponse.json({ error: "Stockage média non configuré" }, { status: 503 });
}
```

## Exemples du codebase

| Fichier | Contexte | Comportement si R2 absent |
|---------|----------|---------------------------|
| `src/server/media/uploadMediaToCatalogueItem.ts` | Worker async | `return` silencieux + log debug |
| `src/server/media/uploadMediaToLiveItem.ts` | Worker async | `return` silencieux + log debug |
| `src/server/media/r2-signed-url.ts` | Génération URL signée | `return null` |
| `src/app/api/catalogue/[itemId]/photo/route.ts` | API upload/serve photo | HTTP 503 avec message UI |
| `src/app/api/proofs/[proofId]/media/route.ts` | API preuve paiement | HTTP 503 avec message UI |
| `src/server/workers/webhook-processor.ts` | Traitement webhook | Skip upload, continue traitement |
| `src/server/api/routers/catalogue.ts` | Query `r2Status` | Retourne `{ configured: false }` |

## Règles

1. **Vérifier en premier** : `isR2Configured()` doit être le premier check avant tout appel S3/R2
2. **Ne jamais crasher** : l'absence de R2 ne doit jamais provoquer une erreur 500
3. **Logger le skip** : utiliser `workerLogger.debug()` ou équivalent pour traçabilité
4. **Message UI clair** : dans les API routes, retourner un message explicite (pas juste 503 vide)
5. **Tests** : mocker `isR2Configured` dans les tests pour couvrir les deux branches

## Checklist pré-CR

- [ ] Tout nouveau code média utilise `isR2Configured()` avant l'appel R2
- [ ] Le comportement sans R2 est documenté (skip silencieux ou erreur explicite)
- [ ] Les tests couvrent `isR2Configured() === false`
- [ ] Pas d'import direct de `@aws-sdk/*` sans guard
