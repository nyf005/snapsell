# Story 12.1: SDK Meta Embedded Signup - bouton Connecter WhatsApp Business

Status: done

## Story

En tant que **vendeur**,
je veux **cliquer sur un bouton "Connecter WhatsApp Business" dans la page Parametres -> Connexion WhatsApp**,
afin de **lancer le flow Meta Embedded Signup (popup OAuth Meta) sans quitter SnapSell et sans copier-coller de tokens**.

## Acceptance Criteria

1. **Given** la page `parametres/whatsapp` existante avec les champs manuels Phone Number ID / Access Token  
   **When** je clique sur "Connecter WhatsApp Business"  
   **Then** un popup Meta s'ouvre (Meta Embedded Signup SDK charge via `window.FB`)

2. **Given** le popup Meta est ouvert  
   **When** je me connecte avec mon compte Meta puis je selectionne/cree mon WABA et mon numero WhatsApp Business  
   **Then** le flux se termine jusqu'au retour du code OAuth cote frontend

3. **Given** la completion du flow Embedded Signup  
   **When** Meta renvoie le code OAuth  
   **Then** la page transmet ce code au backend SnapSell

4. **Given** l'introduction de l'Embedded Signup  
   **When** la page est affichee  
   **Then** les champs manuels restent disponibles en fallback pour les tenants avances

5. **Given** la page Parametres WhatsApp est la seule cible de cette story  
   **When** le SDK Meta est integre  
   **Then** le SDK est charge conditionnellement uniquement sur cette page (pas globalement)

## Tasks / Subtasks

- [x] Integrer le SDK Meta cote frontend dans `src/app/(dashboard)/parametres/_components/whatsapp-config-content.tsx` (AC: 1, 5)
  - [x] Ajouter un loader script idempotent pour `https://connect.facebook.net/.../sdk.js` (avec garde anti double chargement)
  - [x] Initialiser `window.FB.init(...)` uniquement apres chargement script
  - [x] Isoler l'init SDK dans un hook local au composant pour ne pas polluer d'autres pages

- [x] Ajouter CTA "Connecter WhatsApp Business" et etats UX associes (AC: 1, 4)
  - [x] Ajouter bouton principal Embedded Signup, distinct du bouton "Connecter/Mettre a jour" manuel
  - [x] Afficher etat de progression (idle/loading/success/error) pour le flow popup
  - [x] Conserver les champs manuels existants (Phone Number ID, WABA ID, Access Token) comme fallback

- [x] Implementer l'ouverture popup Meta et la recuperation du code OAuth (AC: 1, 2, 3)
  - [x] Appeler `FB.login`/flow Embedded Signup avec scopes requis
  - [x] Recuperer le `code` OAuth de retour de maniere fiable
  - [x] Gerer annulation utilisateur popup et erreurs OAuth avec message utilisateur clair

- [x] Connecter le frontend au backend pour transmettre le code OAuth (AC: 3)
  - [x] Ajouter mutation tRPC dediee (ex: `settings.connectWhatsAppEmbedded`) ou equivalent contractuel valide
  - [x] Envoyer le code OAuth au backend avec guard de session tenant
  - [x] Invalider `settings.getWhatsAppConfig` apres succes pour rafraichir l'etat Connecte/Deconnecte

- [x] Ajouter tests de non-regression et de flow UI (AC: 1-5)
  - [x] Test unitaire du loader SDK (idempotence, cleanup minimal)
  - [x] Test composant: rendu du bouton Embedded Signup + fallback champs manuels
  - [x] Test composant: succes popup -> mutation backend appelee avec code OAuth
  - [x] Test composant: annulation/erreur popup -> message d'erreur utilisateur

## Dev Notes

### Story context and scope guardrails

- Cette story couvre uniquement l'initiation frontend du flow Embedded Signup et l'envoi du code OAuth au backend.
- L'echange du code contre token permanent, la resolution `phone_number_id`/`waba_id`, et le stockage auto des credentials appartiennent a la story 12.2.
- Ne pas casser la configuration manuelle deja en production (story 10.x).

### Existing implementation baseline (must reuse)

- Page cible existante: `src/app/(dashboard)/parametres/whatsapp/page.tsx`
- Composant principal cible: `src/app/(dashboard)/parametres/_components/whatsapp-config-content.tsx`
- API settings existante:
  - `settings.getWhatsAppConfig`
  - `settings.setWhatsAppConfig`
  - `settings.testWhatsAppConnection`
  - Fichier: `src/server/api/routers/settings.ts`
- Schema tenant Meta deja present:
  - `metaPhoneNumberId`
  - `metaWabaId`
  - `metaAccessToken`
  - Fichier: `prisma/schema.prisma`

### Technical requirements

- Charger le SDK uniquement dans un composant client (`"use client"`), jamais dans layout global.
- Implementer un guard `if (window.FB)` avant re-init pour eviter comportements non deterministes.
- Encoder un state anti double-submit pendant ouverture popup (`isEmbeddedSignupPending`).
- Coder le flow pour supporter:
  - popup bloquee
  - popup fermee par utilisateur
  - erreur provider Meta
  - retour sans code
- Message d'erreur utilisateur obligatoire, sans exposer details sensibles.

### Architecture compliance

- Respecter App Router Next.js existant (pas de script global injecte dans `layout.tsx`).
- Respecter isolement tenant via session tRPC existante (`protectedProcedure` dans `settings.ts`).
- Garder la logique provider-specific cote settings/messaging, pas dans des utilitaires globaux hors contexte.

### Library and framework requirements

- Stack existante a conserver:
  - Next.js App Router
  - React client component
  - tRPC (`~/trpc/react`)
  - composants UI existants (`~/components/ui/*`)
- Ne pas introduire une nouvelle librairie OAuth externe pour ce flow si SDK Meta suffit.
- Rester coherent avec conventions de test existantes (Vitest + mocks fetch/API).

### File structure requirements

- Fichiers a modifier en priorite:
  - `src/app/(dashboard)/parametres/_components/whatsapp-config-content.tsx`
  - `src/server/api/routers/settings.ts`
  - `src/server/api/routers/settings.schema.ts` (si nouvelle mutation/input)
  - `src/server/api/routers/settings.test.ts`
- Eventuels nouveaux fichiers permis:
  - helper local frontend dedie au SDK Meta, situe sous `src/app/(dashboard)/parametres/_components/`
  - tests associes a proximite du router/composant modifie
- Interdit pour cette story:
  - modifier webhook Meta (`src/app/api/webhooks/meta/route.ts`)
  - changer schema Prisma
  - toucher workers outbox

### Testing requirements

- Tests unitaires/component obligatoires pour le flow Embedded Signup.
- Les tests existants settings ne doivent pas regresser.
- Couvrir au minimum:
  - rendu CTA + fallback manuel
  - succes popup avec transmission code
  - echec popup / annulation utilisateur
  - absence de chargement SDK hors page cible

### LLM dev guardrails (critical)

- Ne pas reimplementer une nouvelle page WhatsApp: reutiliser le composant existant.
- Ne pas supprimer ou deprecier les champs manuels dans cette story.
- Ne pas stocker de token/credentials dans `localStorage` ou logs client.
- Ne pas ajouter de variable d'environnement publique sensible.
- Ne pas marquer la story done sans tests de flux popup + mutation backend.

## Project Structure Notes

- Projet aligne sur structure Next.js/T3 existante avec separation claire:
  - UI dashboard: `src/app/(dashboard)/...`
  - API tRPC: `src/server/api/routers/...`
  - Messaging providers: `src/server/messaging/providers/...`
- Aucun conflit structurel detecte pour integrer Embedded Signup dans la page actuelle.

## References

- Epic/story source: `_bmad-output/planning-artifacts/epics.md` (Epic 12, Story 12.1)
- PRD source: `_bmad-output/planning-artifacts/prd.md` (scope WhatsApp onboarding)
- Architecture source: `_bmad-output/planning-artifacts/architecture.md` (provider-agnostic + boundaries)
- UX source: `_bmad-output/planning-artifacts/ux-design-specification.md` (clarte parcours Parametres)
- Current implementation:
  - `src/app/(dashboard)/parametres/_components/whatsapp-config-content.tsx`
  - `src/server/api/routers/settings.ts`
  - `src/server/api/routers/settings.schema.ts`
  - `prisma/schema.prisma`

## Completion Notes

- Story context engine genere avec focus anti-regression sur flow manuel existant.
- Story prete pour execution par agent dev avec garde-fous de perimetre explicites.

## Story Completion Status

- Status final: `done`
- Sprint tracking attendu: `12-1-sdk-meta-embedded-signup-bouton-connecter-whatsapp-business -> done`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Source discovery: planning + architecture + ux + codebase settings/meta
- Implementation: Meta SDK helper local (`window.FB`, script idempotent), CTA Embedded Signup, OAuth code extraction
- Validation: `npm test` (624 tests), `npm run test:ui` (25 tests)

### Completion Notes List

- Story selection auto depuis sprint-status backlog (premiere story backlog trouvee)
- Epic 12 basculee en `in-progress`
- Story 12.1 creee avec contexte implementation concret
- SDK Meta charge uniquement depuis la page Parametres WhatsApp via helper local (`meta-embedded-signup-sdk.ts`)
- CTA "Connecter WhatsApp Business" ajoute avec etats `idle/loading/success/error`, gestion popup annulee/erreur
- Code OAuth extrait puis transmis via mutation tRPC `settings.connectWhatsAppEmbedded` (tenant/session guard)
- Champs manuels existants conserves en fallback sans regression
- Ajout de tests UI composant + test unitaire SDK + tests backend mutation/schemas
- Regression suite complete executee et verte avant passage en `review`

### Change Log

- 2026-02-25: Implementation Story 12.1 completee (frontend SDK + popup + mutation backend + tests + env client).
- 2026-02-25: Code review CR appliquee - scopes Embedded Signup ajoutes, loader SDK durci (timeout), reponse backend minimalisee, test hors page cible ajoute.

### File List

- `_bmad-output/implementation-artifacts/12-1-sdk-meta-embedded-signup-bouton-connecter-whatsapp-business.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/app/(dashboard)/parametres/_components/meta-embedded-signup-sdk.ts`
- `src/app/(dashboard)/parametres/_components/meta-embedded-signup-sdk.ui.test.tsx`
- `src/app/(dashboard)/parametres/_components/whatsapp-config-content.tsx`
- `src/app/(dashboard)/parametres/_components/whatsapp-config-content.ui.test.tsx`
- `src/app/(dashboard)/parametres/_components/pricing-grid-content.ui.test.tsx`
- `src/env.js`
- `src/server/api/routers/settings.schema.ts`
- `src/server/api/routers/settings.schema.test.ts`
- `src/server/api/routers/settings.ts`
- `src/server/api/routers/settings.test.ts`

## Senior Developer Review (AI)

### Review Date

2026-02-25

### Reviewer

Fabrice

### Outcome

Approve

### Summary

- 4 findings identifies en revue adversariale (2 HIGH, 2 MEDIUM), tous corriges dans cette passe CR.
- Verification AC et taches `[x]` revalidee apres corrections.
- Suites de test completes executees avec succes: `npm test` + `npm run test:ui`.

### Findings Resolved

- [x] [HIGH] Ajout des scopes requis Embedded Signup dans l'appel `FB.login`.
- [x] [HIGH] Ajout d'un test explicite de non-chargement SDK hors page WhatsApp (`PricingGridContent`).
- [x] [MEDIUM] Durcissement du loader SDK (timeout explicite pour eviter promise pendante).
- [x] [MEDIUM] Reduction de la surface de reponse backend `connectWhatsAppEmbedded` a `{ ok: true }`.
