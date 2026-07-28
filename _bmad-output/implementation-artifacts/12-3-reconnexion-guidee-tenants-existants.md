# Story 12.3: Reconnexion guidee pour les tenants existants

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

En tant que **tenant existant** (credentials saisis manuellement),
je veux **une option pour reconnecter mon WhatsApp via Embedded Signup**,
afin de **migrer vers le nouveau flow sans interruption de service et beneficier du renouvellement automatique de token**.

## Acceptance Criteria

1. **Given** un tenant avec `metaPhoneNumberId` et `metaAccessToken` deja renseignes manuellement  
   **When** j'accede a `parametres/whatsapp`  
   **Then** je vois mon numero actuel connecte et un bouton optionnel `Reconnecter via Meta (recommande)`.

2. **Given** je clique sur `Reconnecter via Meta (recommande)`  
   **When** le flow Embedded Signup se termine  
   **Then** les credentials du tenant sont mis a jour en base.

3. **Given** je ne reconnecte pas via Embedded Signup  
   **When** j'utilise la configuration existante  
   **Then** les credentials manuels continuent de fonctionner sans regression.

4. **Given** je suis sur la page de configuration WhatsApp  
   **When** un tenant est deja connecte  
   **Then** une banniere informative explique le benefice de la reconnexion (renouvellement auto token, moins de configuration manuelle).

## Tasks / Subtasks

- [x] Adapter l'UX de la page WhatsApp pour tenants deja connectes (AC: 1, 4)
  - [x] Afficher une section explicite "Reconnexion recommandee" seulement si `isConnected === true`.
  - [x] Afficher le numero/etat actuellement connecte (`metaPhoneNumberId`/badge connecte) dans cette section.
  - [x] Ajouter une banniere informative orientee migration (benefices, aucune interruption).

- [x] Ajouter le CTA de reconnexion guidee (AC: 1, 2)
  - [x] Remplacer le libelle bouton selon contexte:
    - tenant non connecte: `Connecter WhatsApp Business`
    - tenant connecte: `Reconnecter via Meta (recommande)`
  - [x] Conserver le meme flow technique (`handleEmbeddedSignup` -> `settings.connectWhatsAppEmbedded`).
  - [x] Conserver les etats UX (`loading/success/error`) avec messages adaptes a la reconnexion.

- [x] Garantir le fallback manuel sans regression (AC: 3)
  - [x] Ne pas retirer ni bloquer les champs manuels (`Phone Number ID`, `WABA ID`, `Access Token`).
  - [x] Conserver `setWhatsAppConfig` et `testWhatsAppConnection` inchanges fonctionnellement.
  - [x] Verifier que le token manuel existant reste utilisable si aucune reconnexion n'est faite.

- [x] Renforcer la couverture de tests (AC: 1-4)
  - [x] Tests UI: rendu conditionnel du CTA reconnect quand `isConnected=true`.
  - [x] Tests UI: affichage de la banniere informative de migration pour tenant connecte.
  - [x] Tests UI: tenant non connecte garde le CTA `Connecter`.
  - [x] Tests backend/regression: mutation `connectWhatsAppEmbedded` continue a mettre a jour les credentials sans casser le flow manuel.

## Dev Notes

### Scope et limites

- Cette story est principalement UX + orchestration du flow deja implemente en 12.1/12.2.
- Ne pas re-ecrire la logique OAuth Meta dans cette story: reutiliser `settings.connectWhatsAppEmbedded`.
- Aucun changement de schema Prisma attendu.

### Base existante a reutiliser

- Page cible: `src/app/(dashboard)/parametres/_components/whatsapp-config-content.tsx`
- SDK frontend: `src/app/(dashboard)/parametres/_components/meta-embedded-signup-sdk.ts`
- Mutation backend deja operationnelle: `settings.connectWhatsAppEmbedded` dans `src/server/api/routers/settings.ts`
- Tests existants a etendre:
  - `src/app/(dashboard)/parametres/_components/whatsapp-config-content.ui.test.tsx`
  - `src/server/api/routers/settings.test.ts`

### Contraintes techniques

- Garder l'isolation tenant et RBAC existants (OWNER/MANAGER).
- Garder le fallback manuel actif (pas de mode force Embedded Signup).
- Garder les messages d'erreur clairs, sans fuite de secrets/tokens.
- Eviter les regressions sur:
  - configuration manuelle
  - test de connexion
  - badge connecte/deconnecte

### Architecture compliance

- Respecter l'approche provider-agnostic: cette story touche la couche settings/UI, pas le worker metier.
- Eviter d'introduire un nouveau couplage global (scripts/layout globaux).
- Reutiliser les conventions de composants shadcn deja en place sur la page.

### Library / framework requirements

- Next.js App Router + React client component
- tRPC client mutations (`~/trpc/react`)
- UI shadcn (`Alert`, `Badge`, `Button`, `Card`, etc.)
- Vitest (unit/UI) avec mocks existants

### Previous Story Intelligence (12.2)

- `connectWhatsAppEmbedded` met deja a jour `metaPhoneNumberId`, `metaWabaId`, `metaAccessToken`.
- Le backend gere deja:
  - erreurs metier (`BAD_REQUEST`, `CONFLICT`, `INTERNAL_SERVER_ERROR`)
  - anti-rejeu code OAuth
  - generation token System User Meta
- Cette story doit exploiter cette base sans duplication.

### Git Intelligence Summary

- Les derniers changements ont renforce la robustesse du flow Embedded Signup (token system user, selection deterministe, anti-rejeu).
- Pour 12.3, priorite a la clarté UX et a la non-regression.

### Latest Technical Information

- Codebase actuelle:
  - SDK Embedded Signup deja charge localement sur la page settings WhatsApp.
  - Mutation tRPC `connectWhatsAppEmbedded` deja connectee au bouton.
- Guardrail:
  - conserver un unique point d'entree backend pour la reconnexion afin de limiter la divergence entre "connexion initiale" et "reconnexion".

### Project Context Reference

- Aucun `project-context.md` detecte dans ce workspace.

## Project Structure Notes

- Structure actuelle alignee:
  - UI dashboard: `src/app/(dashboard)/...`
  - API tRPC: `src/server/api/routers/...`
  - provider Meta: `src/server/messaging/providers/meta/...`
- Aucun conflit de structure detecte pour 12.3.

## References

- Epic source: `_bmad-output/planning-artifacts/epics.md` (Epic 12, Story 12.3)
- Story precedente: `_bmad-output/implementation-artifacts/12-2-backend-oauth-callback-meta-stockage-automatique-credentials.md`
- Sprint tracking: `_bmad-output/implementation-artifacts/sprint-status.yaml`
- UI cible:
  - `src/app/(dashboard)/parametres/_components/whatsapp-config-content.tsx`
  - `src/app/(dashboard)/parametres/_components/meta-embedded-signup-sdk.ts`
- Backend existant:
  - `src/server/api/routers/settings.ts`
  - `src/server/messaging/providers/meta/embedded-signup.ts`
- Tests:
  - `src/app/(dashboard)/parametres/_components/whatsapp-config-content.ui.test.tsx`
  - `src/server/api/routers/settings.test.ts`

## Story Completion Status

- Story ID: `12.3`
- Story Key: `12-3-reconnexion-guidee-tenants-existants`
- Story File: `_bmad-output/implementation-artifacts/12-3-reconnexion-guidee-tenants-existants.md`
- Status final: `done`
- Note: code review CR 12-3 effectue, points MEDIUM corriges.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### File List

- `src/app/(dashboard)/parametres/_components/whatsapp-config-content.tsx`
- `src/app/(dashboard)/parametres/_components/whatsapp-config-content.ui.test.tsx`
- `_bmad-output/implementation-artifacts/12-3-reconnexion-guidee-tenants-existants.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Debug Log References

- Sources lues: sprint-status, epics epic 12, story 12.2, page settings WhatsApp, router settings.
- Implementations:
  - `src/app/(dashboard)/parametres/_components/whatsapp-config-content.tsx`
  - `src/app/(dashboard)/parametres/_components/whatsapp-config-content.ui.test.tsx`
- CR fixes:
  - alignement du badge global "Connecte" avec le mode legacy eligibile reconnexion (`phone+token`)
  - ajout d'un test UI sur l'etat badge legacy (connecte/non deconnecte)
- Validation:
  - `npm run test:ui -- src/app/(dashboard)/parametres/_components/whatsapp-config-content.ui.test.tsx` (pass)
  - `npm run test -- src/server/api/routers/settings.test.ts` (pass)
  - `npm run lint` (pass)
