# Story 12.4: Tests end-to-end Embedded Signup (sandbox Meta)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

En tant que **developpeur**,
je veux **un test d'integration end-to-end du flow Embedded Signup dans le sandbox Meta**,
afin de **valider le flow avant deploiement et detecter les regressions futures**.

## Acceptance Criteria

1. **Given** un compte Meta Developer avec une app en mode sandbox  
   **When** le test d'integration est execute (conditionnel: `RUN_INTEGRATION_TESTS=true`)  
   **Then** le flow complet est valide: popup -> code OAuth -> echange token -> stockage credentials -> badge `Connecte`.

2. **Given** le flow Embedded Signup est execute en test  
   **When** des erreurs surviennent cote Meta  
   **Then** les cas sont couverts: token expire, permissions insuffisantes, WABA suspendu.

3. **Given** la suite de tests Meta existe  
   **When** je cherche le test Embedded Signup E2E  
   **Then** il est documente dans `src/server/messaging/providers/meta/__tests__/embedded-signup.integration.test.ts`.

4. **Given** un developpeur veut lancer ce test  
   **When** il consulte la doc du provider Meta  
   **Then** le dossier Meta contient un README expliquant la configuration sandbox et l'execution.

## Tasks / Subtasks

- [x] Creer le test d'integration Embedded Signup (AC: 1, 3)
  - [x] Ajouter `src/server/messaging/providers/meta/__tests__/embedded-signup.integration.test.ts`.
  - [x] Utiliser un guard d'execution conditionnelle (`RUN_INTEGRATION_TESTS=true` et variables env requises).
  - [x] Verifier le happy path complet: reception code OAuth -> `settings.connectWhatsAppEmbedded` -> stockage `metaPhoneNumberId/metaWabaId/metaAccessToken` -> `settings.getWhatsAppConfig` retourne `hasAccessToken=true`.
  - [x] Eviter toute dependance UI navigateur dans ce test backend (simulation du "popup -> code" par payload OAuth de test).

- [x] Couvrir les erreurs Meta critiques (AC: 2)
  - [x] Cas `token expire` (retour Meta 4xx sur echange OAuth) -> erreur metier claire (`BAD_REQUEST`).
  - [x] Cas `permissions insuffisantes` (scopes incomplets) -> erreur metier claire (`BAD_REQUEST`).
  - [x] Cas `WABA suspendu/inexploitable` (compte/numero non resolvable) -> erreur metier (`BAD_REQUEST` ou `INTERNAL_SERVER_ERROR` selon mapping actuel).

- [x] Documenter execution sandbox Meta (AC: 4)
  - [x] Ajouter `src/server/messaging/providers/meta/README.md`.
  - [x] Documenter prerequis env (`META_APP_ID`, `META_APP_SECRET`, `RUN_INTEGRATION_TESTS`, `DATABASE_URL`).
  - [x] Documenter commande de lancement et limites (sandbox only, test potentiellement lent, donnees de test isolees).

- [x] Verifier la non regression globale (AC: 1-4)
  - [x] Conserver les tests existants du router settings (`src/server/api/routers/settings.test.ts`) sans changement de comportement.
  - [x] Conserver les tests UI Embedded Signup (`src/app/(dashboard)/parametres/_components/whatsapp-config-content.ui.test.tsx`) sans regression.

## Dev Notes

### Scope et limites

- Story centree sur l'integration test + documentation d'execution.
- Ne pas modifier le schema Prisma pour cette story.
- Ne pas re-designer le flow UI: reutiliser les comportements valides en 12.1-12.3.

### Base existante a reutiliser

- Provider Embedded Signup:
  - `src/server/messaging/providers/meta/embedded-signup.ts`
- Router tRPC settings:
  - `src/server/api/routers/settings.ts`
  - `src/server/api/routers/settings.test.ts`
- Exemple de pattern integration test conditionnel:
  - `src/server/messaging/providers/meta/__tests__/meta-e2e.integration.test.ts`
- UI deja couverte:
  - `src/app/(dashboard)/parametres/_components/meta-embedded-signup-sdk.ts`
  - `src/app/(dashboard)/parametres/_components/whatsapp-config-content.tsx`

### Contraintes techniques

- Garder isolation tenant et RBAC OWNER/MANAGER dans les appels `settings.connectWhatsAppEmbedded`.
- Les tests doivent etre deterministes:
  - cleanup DB explicite des donnees creees
  - mocks/stubs explicites pour reponses Meta variables
- Ne jamais exposer de token brut dans les assertions de retour `getWhatsAppConfig`.

### Architecture compliance

- Respecter le modele provider-agnostic: test cible la couche Meta provider + router settings, sans couplage au webhook/inbound business.
- Reutiliser les patterns de test existants Vitest (`describe.skipIf`, mocks `fetch`, setup env via `vitest.setup.env.ts`).

### Library / framework requirements

- Node + Vitest (`npm run test`)
- tRPC caller (`createCaller`, `createTRPCContext`) pour test mutation router
- Mocks reseau via `vi.stubGlobal("fetch", ...)` ou equivalent pattern deja utilise dans `settings.test.ts`

### Previous Story Intelligence (12.3)

- 12.3 a confirme:
  - fallback manuel conserve
  - reconnexion guidee deja exposee en UI
  - `connectWhatsAppEmbedded` reste le point d'entree unique backend
- Pour 12.4, priorite: fiabilite de bout en bout cote integration test et documentation runbook.

### Git Intelligence Summary

- Les stories 12.1 -> 12.3 ont etabli:
  - SDK frontend + extraction code OAuth
  - mutation backend `connectWhatsAppEmbedded`
  - gestion d'erreurs metier et anti-rejeu code OAuth
- 12.4 doit verrouiller ces comportements via test d'integration reproductible.

### Latest Technical Information

- Le provider `embedded-signup.ts` utilise `META_GRAPH_VERSION = "v21.0"` et valide scopes obligatoires:
  - `whatsapp_business_management`
  - `whatsapp_business_messaging`
- Le schema d'entree tRPC impose un `code` OAuth non vide:
  - `connectWhatsAppEmbeddedInputSchema` dans `src/server/api/routers/settings.schema.ts`
- Les tests Node chargent `.env/.env.local` via `vitest.setup.env.ts`.

### Project Context Reference

- Aucun `project-context.md` detecte dans ce workspace.

## Project Structure Notes

- Emplacement test integration a respecter:
  - `src/server/messaging/providers/meta/__tests__/embedded-signup.integration.test.ts`
- Emplacement documentation provider:
  - `src/server/messaging/providers/meta/README.md`
- Aucun conflit structurel detecte avec l'arborescence actuelle.

## References

- Epic source:
  - `_bmad-output/planning-artifacts/epics.md` (Epic 12, Story 12.4)
- Story precedente:
  - `_bmad-output/implementation-artifacts/12-3-reconnexion-guidee-tenants-existants.md`
- Sprint tracking:
  - `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Sources techniques:
  - `src/server/messaging/providers/meta/embedded-signup.ts`
  - `src/server/api/routers/settings.ts`
  - `src/server/api/routers/settings.schema.ts`
  - `src/server/api/routers/settings.test.ts`
  - `src/server/messaging/providers/meta/__tests__/meta-e2e.integration.test.ts`
  - `vitest.config.ts`
  - `vitest.setup.env.ts`

## Story Completion Status

- Story ID: `12.4`
- Story Key: `12-4-tests-end-to-end-embedded-signup-sandbox-meta`
- Story File: `_bmad-output/implementation-artifacts/12-4-tests-end-to-end-embedded-signup-sandbox-meta.md`
- Status final: `done`
- Note: code review CR 12-4 effectue, points HIGH/MEDIUM corriges.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Sources lues: epics (Epic 12), sprint-status, story 12.3, provider Meta embedded-signup, settings router/schema/tests, vitest config.
- Implementation:
  - ajout test integration conditionnel `embedded-signup.integration.test.ts` (happy path + 3 cas erreur)
  - ajout `README.md` provider Meta avec prerequis/env/commandes/limites sandbox
- Validation:
  - `RUN_INTEGRATION_TESTS=true npm run test -- src/server/messaging/providers/meta/__tests__/embedded-signup.integration.test.ts` (skipped en environnement sans prerequis sandbox)
  - `npm run test:ui -- src/app/(dashboard)/parametres/_components/whatsapp-config-content.ui.test.tsx` (pass)
  - `npm run lint` (pass)
  - `npm run test` (pass: 617 passed, 15 skipped)

### Completion Notes List

- AC1/AC3 couverts via test integration backend conditionnel, sans dependance navigateur.
- AC2 couvre token expire, scopes insuffisants, WABA/numero non resolvable.
- AC4 couvert via README dedie dans le dossier provider Meta.
- CR fixes:
  - test 12-4 migre vers DB reelle (plus de mock `~/server/db`)
  - guard d'execution aligne avec prerequis (`RUN_INTEGRATION_TESTS`, `DATABASE_URL`, `META_APP_ID`, `META_APP_SECRET`)
  - assert explicite du badge UI `Connecte` ajoute dans les tests UI settings WhatsApp

### File List

- `src/server/messaging/providers/meta/__tests__/embedded-signup.integration.test.ts`
- `src/server/messaging/providers/meta/README.md`
- `_bmad-output/implementation-artifacts/12-4-tests-end-to-end-embedded-signup-sandbox-meta.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-02-25: Implementation DS 12-4 completee, story passee en review.
- 2026-02-25: CR 12-4 applique, story passee en done.
