# Convention : Checklist Nettoyage Dépendance

## Quand utiliser

Lors de la suppression d'un provider, d'une librairie, ou d'une fonctionnalité entière. Exemples :

- Remplacement d'un provider de messaging (Twilio → Meta)
- Suppression d'une dépendance npm
- Retrait d'une feature flag ou d'un module obsolète

## Checklist systématique

### 1. Code source

- [ ] Grep résidus dans `src/` : imports, références, types
- [ ] Grep résidus dans les tests : `*.test.ts`, `*.integration.test.ts`
- [ ] Vérifier les fichiers de configuration : `env.js`, `env.ts`
- [ ] Supprimer les routes API associées
- [ ] Supprimer les adapters/providers associés

### 2. Données et schémas

- [ ] Migration Prisma pour supprimer les colonnes/tables
- [ ] Mettre à jour les seeds (`prisma/seed*.ts`) : supprimer les données du provider
- [ ] Vérifier les fichiers de validation Zod

### 3. Configuration et environnement

- [ ] `.env.example` : supprimer les variables associées
- [ ] `env.js` / `env.ts` : supprimer les variables du schéma de validation
- [ ] `package.json` : supprimer la dépendance npm
- [ ] `package-lock.json` : `npm install` pour regénérer

### 4. Documentation et commentaires

- [ ] Grep commentaires référençant l'ancien provider/lib dans le code
- [ ] Mettre à jour les docs (`docs/`, `README.md`)
- [ ] Supprimer les commentaires TODO/FIXME liés

### 5. Build et cache

- [ ] Supprimer `.next/types` stale
- [ ] `npx prisma generate` pour regénérer le client
- [ ] Vérifier le build : `npm run build` ou `npx tsc --noEmit`

## Exemple : Story 10.6 (Twilio → Meta)

Résidus trouvés et nettoyés :

| Type | Fichier | Résidu |
|------|---------|--------|
| URLs | 14 fichiers | Références `api.twilio.com`, `twilio.com/docs` |
| Seed | `prisma/seed-ops-events.ts` | `provider: "twilio"` dans les données de seed |
| Dead code | `src/server/messaging/providers/twilio/` | Adapter et tests entiers |
| Route | `src/app/api/webhooks/twilio/` | Route webhook et tests |
| Env | `.env.example`, `src/env.js` | Variables `TWILIO_*` |
| Schema | `prisma/schema.prisma` | Colonnes `twilioAccountSid`, `twilioAuthToken`, `twilioPhoneNumber` |

## Règles

1. **Grep avant de déclarer "done"** : `grep -r "ancien_provider"` sur tout le repo
2. **Inclure les commentaires** : les références dans les commentaires sont aussi des résidus
3. **Vérifier `.example` files** : souvent oubliés car non exécutés
4. **Un commit dédié** : le nettoyage doit être dans le même commit que la suppression

## Checklist pré-CR

- [ ] `grep -ri "<ancien_provider>"` retourne 0 résultat (hors `git log`)
- [ ] `npx vitest run` passe
- [ ] `npx prisma validate` passe
- [ ] Pas de variables d'environnement orphelines dans `.env.example`
- [ ] `package.json` ne contient plus la dépendance supprimée
