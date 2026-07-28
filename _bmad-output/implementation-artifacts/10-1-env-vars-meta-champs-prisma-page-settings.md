# Story 10.1: Env vars Meta + champs Prisma sur Tenant + page settings « Connexion WhatsApp »

Status: done

## Story

En tant que **vendeur ou manager**,
je veux **configurer ma connexion WhatsApp Business Meta depuis la page Paramètres → Connexion WhatsApp, en saisissant mon Phone Number ID, WABA ID et Access Token**,
afin que **mon tenant soit connecté à mon propre numéro WhatsApp Business via l'API Meta**.

## Acceptance Criteria

1. **AC1 — Env vars Meta ajoutées dans `env.js`**
   **Given** le fichier `src/env.js` actuel
   **When** la story est complétée
   **Then** `META_APP_SECRET` (string, optionnel) et `META_VERIFY_TOKEN` (string, optionnel) sont ajoutés dans la section `server` avec validation Zod, et dans `runtimeEnv`

2. **AC2 — Champs Meta ajoutés au model Tenant (Prisma)**
   **Given** le model `Tenant` dans `prisma/schema.prisma`
   **When** la migration est appliquée
   **Then** 3 champs ajoutés : `metaPhoneNumberId String? @unique @map("meta_phone_number_id")`, `metaWabaId String? @map("meta_waba_id")`, `metaAccessToken String? @map("meta_access_token")` ; migration Prisma passe sans erreur ; les champs Twilio existants ne sont pas modifiés

3. **AC3 — Page settings transformée : 3 champs Meta**
   **Given** la page `parametres/whatsapp` existante (1 champ numéro Twilio)
   **When** le vendeur accède à Paramètres → Connexion WhatsApp
   **Then** le formulaire affiche 3 champs : Phone Number ID, WABA ID, Access Token (type password avec toggle afficher/masquer) ; le champ numéro Twilio est remplacé par ces 3 champs

4. **AC4 — Sauvegarde via tRPC**
   **Given** le vendeur remplit les 3 champs et clique Enregistrer
   **When** la mutation `settings.setWhatsAppConfig` est appelée
   **Then** les 3 valeurs sont persistées sur le Tenant en base ; les valeurs vides sont traitées comme null

5. **AC5 — Badge connecté/déconnecté**
   **Given** la page settings affiche le badge de statut
   **When** les 3 champs Meta sont renseignés (non null, non vide)
   **Then** le badge affiche « Connecté » (vert) ; sinon « Déconnecté » (rouge)

6. **AC6 — Lecture config (query tRPC)**
   **Given** le vendeur arrive sur la page settings
   **When** `settings.getWhatsAppConfig` est appelé
   **Then** les 3 champs Meta du tenant sont retournés et pré-remplis dans le formulaire

## Tasks / Subtasks

- [x] Task 1 — Env vars Meta dans `env.js` (AC: #1)
  - [x] 1.1 Ajouter `META_APP_SECRET: z.string().min(1).optional()` dans section `server`
  - [x] 1.2 Ajouter `META_VERIFY_TOKEN: z.string().min(1).optional()` dans section `server`
  - [x] 1.3 Ajouter les 2 entrées dans `runtimeEnv`
  - [x] 1.4 Ajouter les 2 vars dans `.env.example` (si existe) avec commentaire

- [x] Task 2 — Schema Prisma + migration (AC: #2)
  - [x] 2.1 Ajouter les 3 champs au model `Tenant` dans `prisma/schema.prisma`
  - [x] 2.2 Exécuter `npx prisma migrate dev --name add-meta-whatsapp-fields`
  - [x] 2.3 Vérifier que le generated client inclut les nouveaux champs

- [x] Task 3 — Schema Zod settings (AC: #4)
  - [x] 3.1 Créer `setMetaConfigInputSchema` dans `settings.schema.ts` : `metaPhoneNumberId` (string | null, trim, non-E164), `metaWabaId` (string | null, trim), `metaAccessToken` (string | null, trim). NE PAS modifier `setWhatsAppConfigInputSchema` existant (conservé pour rétrocompatibilité)
  - [x] 3.2 Mettre à jour les tests dans `settings.schema.test.ts`

- [x] Task 4 — tRPC router settings (AC: #4, #6)
  - [x] 4.1 Modifier `getWhatsAppConfig` : retourner `metaPhoneNumberId`, `metaWabaId`, et `hasAccessToken: boolean` (NE PAS retourner le token en clair)
  - [x] 4.2 Modifier `setWhatsAppConfig` : sauvegarder les 3 champs Meta au lieu de `whatsappPhoneNumber` ; vérifier unicité `metaPhoneNumberId` (comme aujourd'hui pour `whatsappPhoneNumber`)
  - [x] 4.3 Conserver le champ `whatsappPhoneNumber` inchangé (suppression dans story 10.6)

- [x] Task 5 — UI page settings (AC: #3, #5)
  - [x] 5.1 Modifier `whatsapp-config-content.tsx` : remplacer le champ numéro unique par 3 champs (Phone Number ID, WABA ID, Access Token)
  - [x] 5.2 Access Token : `type="password"` avec bouton toggle (oeil) pour afficher/masquer
  - [x] 5.3 Badge connecté : basé sur les 3 champs non null/non vide
  - [x] 5.4 Mettre à jour les étapes (stepper gauche) : 1. Saisir les identifiants Meta, 2. Enregistrer
  - [x] 5.5 Mettre à jour le texte descriptif et l'alerte info pour expliquer où trouver les credentials Meta

- [x] Task 6 — Tests (AC: tous)
  - [x] 6.1 Tests unitaires schema Zod (nouveaux champs Meta)
  - [x] 6.2 Vérifier que les tests existants passent (0 régression)

## Dev Notes

### Architecture & Patterns

- **Provider-agnostic (§7.1)** : cette story ne touche PAS au `MessagingProvider` interface ni aux adapters. Elle prépare uniquement les données (Prisma + env) et l'UI (settings).
- **RBAC** : seuls Owner et Manager accèdent aux settings (`canManageGrid`). Pas de changement.
- **Isolation tenant** : unicité sur `metaPhoneNumberId` (comme `whatsappPhoneNumber` aujourd'hui).
- **Sécurité token** : `metaAccessToken` est sensible. La query `getWhatsAppConfig` retourne un booléen `hasAccessToken` (true/false) au lieu du token en clair. Le token complet n'est jamais renvoyé au client. Pour l'UI : si token déjà en base, afficher "Token configuré" avec bouton "Remplacer". Le formulaire n'envoie le token que si l'utilisateur le saisit/modifie.
- **Validation** : `metaPhoneNumberId` est un ID numérique Meta (pas un numéro E.164). Ne PAS utiliser `e164PhoneSchema`. Valider avec `z.string().min(1)` (non vide) ou null.
- **Section numéros vendeur** : la section "Numéros vendeur" (seller phones) de la page settings n'est PAS modifiée par cette story.

### Fichiers à modifier

| Fichier | Modification |
|---------|-------------|
| `src/env.js` | Ajouter `META_APP_SECRET`, `META_VERIFY_TOKEN` |
| `prisma/schema.prisma` | Ajouter 3 champs Meta au model Tenant |
| `src/server/api/routers/settings.schema.ts` | Modifier schema input (3 champs Meta) |
| `src/server/api/routers/settings.schema.test.ts` | Mettre à jour tests |
| `src/server/api/routers/settings.ts` | Modifier `getWhatsAppConfig` et `setWhatsAppConfig` |
| `src/app/(dashboard)/parametres/_components/whatsapp-config-content.tsx` | 3 champs + password toggle + badge |

### Ce qui NE change PAS

- `src/server/messaging/types.ts` — interface MessagingProvider intacte
- `src/server/messaging/providers/twilio/adapter.ts` — pas touché
- `src/app/api/webhooks/twilio/route.ts` — pas touché
- `src/server/workers/outbox-sender.ts` — pas touché
- `src/lib/zod/webhook.ts` — pas touché (le schema Meta webhook sera dans story 10.3)
- Le champ `whatsappPhoneNumber` sur Tenant — conservé pour rétrocompatibilité (suppression story 10.6)

### Patterns existants à suivre

- **Schema Zod** : utiliser `.transform(s => s === "" || s == null ? null : String(s).trim())` comme le schema actuel `setWhatsAppConfigInputSchema`
- **tRPC** : unicité vérifiée par `findFirst` + `where: { id: { not: tenantId } }` avant update, avec catch `P2002`
- **UI** : composants shadcn/ui (`Input`, `Label`, `Card`, `Badge`, `Alert`, `Button`) — même pattern que le formulaire actuel
- **Prisma map** : utiliser `@map("snake_case")` pour les noms de colonnes en base (convention du projet)

### References

- [Source: docs/migration-twilio-meta-whatsapp.md] — plan de migration complet
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-10] — epic breakdown
- [Source: _bmad-output/planning-artifacts/architecture.md#§7.1] — architecture provider-agnostic
- [Source: src/server/api/routers/settings.ts] — router tRPC actuel
- [Source: src/server/api/routers/settings.schema.ts] — schemas Zod actuels
- [Source: src/app/(dashboard)/parametres/_components/whatsapp-config-content.tsx] — UI actuelle

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- Prisma `migrate dev` échoue en environnement non-interactif → migration SQL créée manuellement + `prisma migrate deploy`

### Completion Notes List
- ✅ Task 1: `META_APP_SECRET` et `META_VERIFY_TOKEN` ajoutés dans `env.js` (server + runtimeEnv) et `.env.example`
- ✅ Task 2: 3 champs Meta (`metaPhoneNumberId` @unique, `metaWabaId`, `metaAccessToken`) ajoutés au model Tenant, migration `20260217000000_add_meta_whatsapp_fields` appliquée, client Prisma regénéré
- ✅ Task 3: `setMetaConfigInputSchema` créé avec `nullableStringTrimmed` helper. 5 nouveaux tests ajoutés (16 total dans le fichier)
- ✅ Task 4: `getWhatsAppConfig` retourne `metaPhoneNumberId`, `metaWabaId`, `hasAccessToken` (booléen). Mutation `setWhatsAppConfig` modifiée pour sauver les 3 champs Meta avec unicité `metaPhoneNumberId` (conforme AC4)
- ✅ Task 5: UI transformée — 3 champs Meta, password toggle (Eye/EyeOff), badge connecté basé sur 3 champs, stepper mis à jour, alerte info Meta Business Suite, bouton "Tester la connexion" conservé (désactivé)
- ✅ Task 6: 571 tests passent, 0 régression. 5 tests schema Zod + 8 tests router tRPC ajoutés

### Senior Developer Review (AI)
- **Date:** 2026-02-17
- **Outcome:** Changes Requested → Fixed
- **Findings:** 1 High, 3 Medium, 1 Low — all resolved
- **Action Items:**
  - [x] [HIGH] Fix token overwrite bug: null metaAccessToken no longer erases existing token (settings.ts)
  - [x] [MEDIUM] AC4 conformance: setWhatsAppConfig now uses setMetaConfigInputSchema (was separate setMetaConfig)
  - [x] [MEDIUM] Added 8 tRPC router tests (RBAC, uniqueness, token preservation, no raw token exposure)
  - [x] [MEDIUM] Added TODO comment for at-rest encryption on metaAccessToken (prisma/schema.prisma)
  - [x] [LOW] Restored disabled "Tester la connexion" button removed during UI rewrite

### File List
- `src/env.js` — ajout META_APP_SECRET, META_VERIFY_TOKEN (server + runtimeEnv)
- `.env.example` — ajout section Meta WhatsApp Cloud API
- `prisma/schema.prisma` — ajout 3 champs Meta au model Tenant + TODO chiffrement
- `prisma/migrations/20260217000000_add_meta_whatsapp_fields/migration.sql` — nouveau fichier migration
- `src/server/api/routers/settings.schema.ts` — ajout setMetaConfigInputSchema + type export
- `src/server/api/routers/settings.schema.test.ts` — ajout 5 tests pour setMetaConfigInputSchema
- `src/server/api/routers/settings.ts` — getWhatsAppConfig enrichi + setWhatsAppConfig modifié (Meta, fix token overwrite)
- `src/server/api/routers/settings.test.ts` — nouveau : 8 tests router tRPC (RBAC, unicité, token, sécurité)
- `src/app/(dashboard)/parametres/_components/whatsapp-config-content.tsx` — réécriture complète (3 champs Meta, password toggle, badge, stepper, bouton test)

## Change Log
- 2026-02-17: Story 10.1 implémentée — env vars Meta, champs Prisma Tenant, schema Zod, tRPC router, UI settings 3 champs Meta
- 2026-02-17: Code review fixes — token overwrite bug, AC4 conformance (setWhatsAppConfig), 8 router tests, TODO chiffrement, bouton test restauré
