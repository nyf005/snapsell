# Story 12.2: Backend - OAuth callback Meta + stockage automatique des credentials

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

En tant que **systeme**,
je veux **recevoir le code OAuth issu de l'Embedded Signup, l'echanger contre un token via Meta Graph, recuperer `phone_number_id` et `waba_id`, puis stocker automatiquement les credentials du tenant**,
afin que **le tenant soit connecte sans saisie manuelle**.

## Acceptance Criteria

1. **Given** le frontend transmet un `code` OAuth valide  
   **When** la mutation tRPC `settings.connectWhatsAppEmbedded` est appelee  
   **Then** le backend echange ce code avec Meta via `POST /oauth/access_token`.

2. **Given** un token d'acces obtenu  
   **When** le backend interroge les endpoints Meta necessaires  
   **Then** il recupere un `waba_id` et un `phone_number_id` coherents avec le tenant connecte.

3. **Given** les informations Meta resolues  
   **When** la mutation se termine avec succes  
   **Then** le tenant est mis a jour en base avec `metaPhoneNumberId`, `metaWabaId`, `metaAccessToken`.

4. **Given** la config est stockee  
   **When** le frontend invalide/recharge `settings.getWhatsAppConfig`  
   **Then** le badge affiche "Connecte".

5. **Given** un code expire, invalide, ou permissions insuffisantes  
   **When** l'echange ou la lecture Graph echoue  
   **Then** le backend renvoie une erreur metier claire (sans fuite d'informations sensibles).

6. **Given** la story est implementee  
   **When** la suite de tests settings/meta est executee  
   **Then** elle couvre succes, code invalide/expire, permissions insuffisantes, et protection RBAC.

## Tasks / Subtasks

- [x] Implementer la logique backend de `connectWhatsAppEmbedded` (AC: 1, 2, 3, 5)
  - [x] Ajouter un service dedie pour l'echange OAuth Meta (pas de logique HTTP inline massive dans le router).
  - [x] Appeler `POST /oauth/access_token` avec `client_id`, `client_secret`, `code`.
  - [x] Chainer les appels Graph necessaires pour resoudre `waba_id` + `phone_number_id`.
  - [x] Valider les reponses (presence des IDs requis) avant ecriture DB.

- [x] Mettre a jour la persistance tenant (AC: 3, 4)
  - [x] Updater `Tenant` (`metaPhoneNumberId`, `metaWabaId`, `metaAccessToken`) dans une operation atomique.
  - [x] Gerer le conflit d'unicite `metaPhoneNumberId` (P2002 -> TRPC `CONFLICT` explicite).
  - [x] Retourner un payload minimal (ex: `{ ok: true }`) pour limiter l'exposition de donnees.

- [x] Harmoniser la couche validation/schemas (AC: 1, 5)
  - [x] Conserver `connectWhatsAppEmbeddedInputSchema` (code requis) et ajouter, si necessaire, des contraintes d'entree supplementaires.
  - [x] Normaliser les erreurs Meta -> erreurs tRPC stables et traduisibles cote UI.

- [x] Ajouter les tests backend (AC: 6)
  - [x] Test succes: code valide -> tenant mis a jour.
  - [x] Test code invalide/expire -> erreur `BAD_REQUEST` (message utilisateur clair).
  - [x] Test permissions manquantes/Graph refuse -> erreur metier claire.
  - [x] Test role `AGENT` -> `FORBIDDEN`.
  - [x] Test conflit `metaPhoneNumberId` deja utilise -> `CONFLICT`.

- [x] Verifications de non-regression (AC: 6)
  - [x] Executer au minimum les tests du router settings et des composants WhatsApp relies.
  - [x] Verifier que la configuration manuelle (`setWhatsAppConfig`) reste fonctionnelle.

## Dev Notes

### Scope et limites de la story

- Cette story implemente le backend OAuth et le stockage automatique apres le flow frontend livre en 12.1.
- Ne pas modifier le flux Embedded Signup UI principal, deja en place dans `whatsapp-config-content.tsx`.
- Conserver le fallback manuel (saisie directe des credentials) sans regression.

### Baseline code existante (a reutiliser)

- Mutation cible: `src/server/api/routers/settings.ts` -> `connectWhatsAppEmbedded` (actuellement placeholder qui retourne `{ ok: true }`).
- Input schema deja present: `src/server/api/routers/settings.schema.ts` -> `connectWhatsAppEmbeddedInputSchema`.
- Consommation frontend deja branchee:
  - `src/app/(dashboard)/parametres/_components/whatsapp-config-content.tsx`
  - `src/app/(dashboard)/parametres/_components/meta-embedded-signup-sdk.ts`
- Champs Prisma deja disponibles sur `Tenant`: `metaPhoneNumberId`, `metaWabaId`, `metaAccessToken`.

### Exigences techniques (guardrails)

- Garder `protectedProcedure` + controle RBAC `canManageGrid` (OWNER/MANAGER seulement).
- Encapsuler les appels Meta Graph dans une couche service testable (mockable), pas dans le composant UI.
- Toujours `encodeURIComponent` pour les parametres URL et verifier les payloads reponses.
- Ne jamais logger le token complet ni le retourner au frontend.
- Ajouter un timeout/retry raisonnable pour les appels externes (eviter blocage indefini).

### Contraintes architecture

- Respecter l'approche provider-agnostic (architecture section 7.1): la logique metier reste independante du BSP.
- Limiter les changements a la couche settings/meta credentials; ne pas introduire de couplage avec les workers metier.
- Preserver les conventions de gestion d'erreurs tRPC deja en place dans `settings.ts`.

### Libraries / frameworks

- Stack a conserver: Next.js App Router + tRPC + Prisma + Zod + Vitest.
- Reutiliser la strategie fetch actuelle du projet (pas d'ajout de SDK Meta serveur supplementaire sans besoin strict).

### File structure cible (prevision implementation)

- Fichiers a modifier en priorite:
  - `src/server/api/routers/settings.ts`
  - `src/server/api/routers/settings.test.ts`
  - `src/server/api/routers/settings.schema.ts` (si ajustement schema necessaire)
- Nouveau fichier recommande:
  - `src/server/messaging/providers/meta/embedded-signup.ts` (ou `src/server/services/meta-embedded-signup.ts`) pour isoler la logique OAuth/Graph.

### Tests requis

- Router:
  - succes mutation + ecriture DB
  - RBAC
  - erreurs Meta converties proprement
  - conflit unicite
- Integration legere:
  - invalidation `getWhatsAppConfig` inchangee cote frontend (deja couverte partiellement en 12.1)

### Previous Story Intelligence (12.1)

- Le frontend appelle deja `settings.connectWhatsAppEmbedded({ code })`.
- Les cas popup annulee/erreur OAuth sont deja geres cote UI.
- Le backend doit maintenant remplacer l'ack vide par un flux OAuth reel sans casser les tests 12.1.

### Git Intelligence Summary (recent)

- Commit recents sur `settings` montrent des corrections de validation Meta (phone_numbers via WABA).
- Pattern a conserver: messages d'erreur metier clairs et validation stricte de coherence `phone_number_id`/WABA.
- Eviter les regressions sur `setWhatsAppConfig` et `testWhatsAppConnection`.

### Latest Technical Information (web + codebase)

- Codebase actuel:
  - SDK frontend Embedded Signup initialise avec `version: v20.0` dans `meta-embedded-signup-sdk.ts`.
  - Adapter backend Meta utilise `API_VERSION = v21.0` dans `src/server/messaging/providers/meta/adapter.ts`.
- Recherche externe effectuee:
  - Meta Postman workspace/reference confirme l'usage des endpoints Graph pour OAuth/token et ressources WhatsApp (Cloud API), avec version Graph parametree.
- Guardrail implementation:
  - Centraliser la version Graph dans une constante partagee (ou config unique) pour eviter la derive `v20/v21`.
  - Verifier avant merge la version cible retenue et l'aligner sur tous les appels Meta.

### Project Context Reference

- Aucun fichier `project-context.md` detecte dans le workspace pour cette story.

## References

- Epic source: `_bmad-output/planning-artifacts/epics.md` (Epic 12, Story 12.2)
- Sprint tracking: `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Story precedente: `_bmad-output/implementation-artifacts/12-1-sdk-meta-embedded-signup-bouton-connecter-whatsapp-business.md`
- Router settings:
  - `src/server/api/routers/settings.ts`
  - `src/server/api/routers/settings.schema.ts`
  - `src/server/api/routers/settings.test.ts`
- Frontend Embedded Signup:
  - `src/app/(dashboard)/parametres/_components/whatsapp-config-content.tsx`
  - `src/app/(dashboard)/parametres/_components/meta-embedded-signup-sdk.ts`
- Meta provider existant:
  - `src/server/messaging/providers/meta/adapter.ts`
  - `src/app/api/webhooks/meta/route.ts`
- Architecture: `_bmad-output/planning-artifacts/architecture.md` (section messaging provider-agnostic)

## Story Completion Status

- Story ID: `12.2`
- Story Key: `12-2-backend-oauth-callback-meta-stockage-automatique-credentials`
- Story File: `_bmad-output/implementation-artifacts/12-2-backend-oauth-callback-meta-stockage-automatique-credentials.md`
- Status final: `ready-for-dev`
- Note: contexte complet prepare pour execution `dev-story`.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Sources lues: sprint-status, epics, architecture, story 12.1, router settings, composants Embedded Signup.
- RED: ajout des cas de tests `connectWhatsAppEmbedded` (succes, code invalide, permissions manquantes, conflit P2002, RBAC).
- GREEN: implementation service `resolveMetaEmbeddedSignupCredentials` (code -> token -> token longue duree -> debug_token -> me/whatsapp_business_accounts).
- GREEN: branchement router `settings.connectWhatsAppEmbedded` avec persistance atomique des champs tenant Meta.
- Validation executee: `npm run test -- src/server/api/routers/settings.test.ts`, `npm test`, `npm run test:ui`.
- Validation additionnelle: `npm run lint` non disponible (script absent dans `package.json`).

### Completion Notes List

- AC1 couvert: appel Meta `POST /oauth/access_token` avec `client_id`, `client_secret`, `code`.
- AC2 couvert: chainage Graph pour recuperer `waba_id` et `phone_number_id` via `me/whatsapp_business_accounts`, avec verification `debug_token`.
- AC3/AC4 couverts: ecriture DB `metaPhoneNumberId`, `metaWabaId`, `metaAccessToken` dans `Tenant`; retour mutation minimal `{ ok: true }`.
- AC5 couvert: erreurs metier stables (`BAD_REQUEST`, `CONFLICT`, `INTERNAL_SERVER_ERROR`) sans fuite de secret.
- AC6 couvert: tests backend et regression executes et passants.

### File List

- src/server/messaging/providers/meta/embedded-signup.ts
- src/server/api/routers/settings.ts
- src/server/api/routers/settings.test.ts
- src/env.js
- _bmad-output/implementation-artifacts/12-2-backend-oauth-callback-meta-stockage-automatique-credentials.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-02-25: implementation complete de `settings.connectWhatsAppEmbedded` avec service dedie Meta Embedded Signup (OAuth exchange + token extension + debug + resolution WABA/phone).
- 2026-02-25: ajout des tests backend de la mutation `connectWhatsAppEmbedded` (succes + erreurs metier + RBAC + conflit unicite).
- 2026-02-25: verification de non-regression executee (`npm test`, `npm run test:ui`).
- 2026-02-25: code review CR appliquee - token system user via API Meta, selection WABA/phone deterministe, anti-rejeu code OAuth, config serveur `META_APP_ID`.

## Senior Developer Review (AI)

### Review Date

2026-02-25

### Reviewer

Fabrice

### Outcome

Approve

### Summary

- 5 findings identifies (2 HIGH, 2 MEDIUM, 1 LOW), tous corriges dans cette passe CR.
- Validation complete relancee apres corrections: `npm run test -- src/server/api/routers/settings.test.ts`, `npm test`, `npm run test:ui`.
- `npm run lint` non disponible (script absent), aucun gate lint configure dans ce repo.

### Findings Resolved

- [x] [HIGH] Generation explicite d'un System User Token via API Meta avant persistance tenant.
- [x] [HIGH] Resolution WABA/phone rendue deterministe (selection unique requise, sinon erreur metier claire).
- [x] [MEDIUM] Protection anti-rejeu ajoutee pour code OAuth (memoire TTL tenant+code).
- [x] [MEDIUM] Story/File tracking remis en coherence avec fichiers reellement touches dans cette story.
- [x] [LOW] Suppression du couplage serveur a `NEXT_PUBLIC_META_APP_ID` via variable serveur dediee `META_APP_ID`.
