# Convention : Prisma Migrations

## Quand utiliser chaque commande

| Commande | Quand | Exemple |
|----------|-------|---------|
| `npx prisma migrate dev --name <name>` | Ajout/suppression de colonnes, tables, indexes en dev | Story 10.1 : ajout `metaPhoneNumberId` |
| `npx prisma db push` | Prototypage rapide, sync schema sans créer de migration | Itération locale avant finalisation |
| SQL manuel dans migration | Migrations de données, renommages complexes, cas non supportés par Prisma | Story 10.6 : suppression champs Twilio |

## Workflow recommandé

1. Modifier `prisma/schema.prisma`
2. `npx prisma validate` — vérifier la syntaxe
3. `npx prisma migrate dev --name <description_snake_case>` — générer la migration
4. `npx prisma generate` — regénérer le client Prisma
5. Supprimer `.next/types` si des types stale causent des erreurs TS
6. Vérifier les tests : `npx vitest run`

## Exemples du codebase

| Story | Migration | Description |
|-------|-----------|-------------|
| 10.1 | `add_meta_whatsapp_fields` | Ajout colonnes Meta (phoneNumberId, wabaId, accessToken) |
| 10.6 | `remove_twilio_fields` | Suppression colonnes Twilio (accountSid, authToken, phoneNumber) |

## Règles

1. **Toujours `prisma validate`** avant de générer une migration
2. **Toujours `prisma generate`** après une migration pour synchroniser le client
3. **Nettoyer `.next/types`** si des erreurs TS persistent après `generate`
4. **Nommer les migrations** en snake_case descriptif (ex: `add_meta_whatsapp_fields`)
5. **Un fichier migration par changement logique** — ne pas mélanger des changements non liés
6. **Ne pas modifier manuellement** les fichiers de migration déjà appliqués en production

## Tests en échec attendus en dev local

| Test | Raison | Résolution |
|------|--------|------------|
| `meta-e2e.integration.test.ts` | Nécessite `RUN_INTEGRATION_TESTS=true` + `DATABASE_URL` | Skip automatique via `describe.skipIf` — pas un échec réel |
| `webhook-processor.integration.test.ts` | Nécessite `RUN_INTEGRATION_TESTS=true` + `DATABASE_URL` | Skip automatique via guard — limitation infra locale |

## Checklist pré-CR

- [ ] `npx prisma validate` passe
- [ ] `npx prisma generate` exécuté, fichiers `generated/` à jour
- [ ] Migration nommée de façon descriptive
- [ ] Pas de types stale dans `.next/types`
- [ ] `npx vitest run` passe (hors tests integration sans env vars)
- [ ] Si migration destructive : vérifier que les données existantes sont gérées
