# Story 12.5: Auto-ajout du numero WhatsApp Business dans sellerPhones apres connexion Meta

Status: done

## Story

En tant que **manager/vendeur**,
je veux **que le numero WhatsApp Business connecte via Meta soit automatiquement ajoute dans `sellerPhones`**,
afin de **pouvoir piloter le bot depuis ce numero sans configuration manuelle supplementaire**.

## Acceptance Criteria

1. **Given** une connexion Meta Embedded Signup reussie (mutation `settings.connectWhatsAppEmbedded`)  
   **When** le backend persiste `metaPhoneNumberId`/`metaWabaId`/`metaAccessToken`  
   **Then** le numero WhatsApp Business associe est ajoute a `seller_phones` pour le tenant si absent.

2. **Given** ce numero existe deja dans `seller_phones`  
   **When** la connexion/reconnexion Meta est relancee  
   **Then** aucun doublon n'est cree (idempotence).

3. **Given** l'auto-ajout seller phone echoue apres connexion Meta valide  
   **When** l'erreur survient  
   **Then** l'erreur est journalisee clairement et la strategie transactionnelle choisie est respectee (tout rollback ou erreur explicite) pour eviter un etat incoherent.

4. **Given** la page `parametres/whatsapp` est rechargee apres succes  
   **When** `sellerPhones.list` est lu  
   **Then** le numero business apparait dans la liste "Numeros vendeur" sans action utilisateur.

5. **Given** ce changement est livre  
   **When** la suite de tests settings/sellerPhones est executee  
   **Then** elle couvre le happy path, l'idempotence, et l'absence de regression des flux manuels existants.

## Scope

- Inclure uniquement:
  - `settings.connectWhatsAppEmbedded` (post-resolution credentials)
  - persistance `sellerPhone` liee au tenant
  - tests backend associes
- Exclure:
  - synchronisation vers Meta Business Platform
  - modifications UI majeures
  - changement schema Prisma

## Implementation Notes

- Source de verite pour l'auto-ajout: numero resolu lors du flow Embedded Signup (format a normaliser en E.164 avant insert `seller_phones`).
- Contrainte existante `@@unique([tenantId, phoneNumber])` sur `SellerPhone` a reutiliser pour idempotence.
- Eviter tout couplage "sellerPhones -> Meta": `sellerPhones` reste une config interne SnapSell pour routing vendeur/client.
- Ajouter logs applicatifs explicites pour succes/skip deja-existant/echec.

## Tasks / Subtasks

- [x] Ajouter la logique d'auto-ajout dans `settings.connectWhatsAppEmbedded` (AC: 1,2,3)
- [x] Normaliser le numero avant insertion `sellerPhone` (AC: 1)
- [x] Gerer le cas "deja present" sans erreur bloquante (AC: 2)
- [x] Ajouter tests unitaires/integration router settings (AC: 5)
- [x] Verifier non-regression `setWhatsAppConfig`, `sellerPhones.add/remove/list` (AC: 5)

## Files Cibles

- `src/server/api/routers/settings.ts`
- `src/server/api/routers/settings.test.ts`
- (si necessaire) utilitaire phone validation deja existant sous `src/lib/validations/phone`

## Definition of Done

- AC 1-5 valides
- Tests passes
- Story statut passe a `done`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Analyse story + code cible:
  - `src/server/api/routers/settings.ts`
  - `src/server/messaging/providers/meta/embedded-signup.ts`
  - `src/server/api/routers/settings.test.ts`
  - `src/server/messaging/providers/meta/__tests__/embedded-signup.integration.test.ts`
- Validation executee:
  - `npm run test -- src/server/api/routers/settings.test.ts`
  - `npm run test -- src/server/messaging/providers/meta/__tests__/embedded-signup.integration.test.ts`
  - `npm run test -- src/server/api/routers/sellerPhones.test.ts`
  - `npm run test -- src/server/api/routers/settings.test.ts src/server/messaging/providers/meta/__tests__/embedded-signup.integration.test.ts src/server/api/routers/sellerPhones.test.ts`
  - `npm run lint` (typecheck)

### Completion Notes

- Ajout auto du numero business apres `connectWhatsAppEmbedded` dans une transaction DB:
  - update tenant credentials Meta
  - ensure seller phone present via `upsert` (idempotent)
- Extraction du numero business depuis Embedded Signup (`display_phone_number`) et propagation dans le resultat du resolver.
- Normalisation avant insertion seller phone avec validation E.164.
- Idempotence explicite: si numero deja present, aucun doublon cree.
- Journalisation explicite:
  - seller phone ensured
  - echec auto-ajout

### File List

- `src/server/messaging/providers/meta/embedded-signup.ts`
- `src/server/api/routers/settings.ts`
- `src/server/api/routers/settings.test.ts`
- `src/server/messaging/providers/meta/__tests__/embedded-signup.integration.test.ts`
- `_bmad-output/implementation-artifacts/12-5-auto-ajout-numero-business-dans-seller-phones.md`

### Change Log

- 2026-02-25: Auto-ajout du numero WhatsApp Business dans `sellerPhones` apres Embedded Signup (transactionnel, idempotent, avec logs et tests).
