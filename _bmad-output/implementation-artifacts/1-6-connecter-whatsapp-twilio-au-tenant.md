# Story 1.6: Connecter WhatsApp (Twilio) au tenant

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **vendeur**,
I want **connecter mon numéro WhatsApp à mon tenant**,
so that **les messages entrants et sortants passent par SnapSell pour mon espace**.

## Acceptance Criteria

1. **Given** je suis connecté au dashboard et SnapSell a configuré la réception WhatsApp (compte plateforme, webhook)  
   **When** je saisis mon numéro WhatsApp (format international, ex. +33…) pour mon tenant  
   **Then** le tenant est associé à ce numéro ; les messages entrants sont attribués à ce tenant (FR6)  
   **And** FR4 couvert

**Clarification produit :** Le vendeur **n’a pas besoin** d’un compte Twilio ni de codes (SID, token). C’est la **plateforme SnapSell** qui utilise un compte Twilio (ou autre BSP) ; le vendeur ne fait que **lier son numéro WhatsApp** à son espace (tenant). La saisie attendue est le **numéro au format E.164** (ex. +33612345678).

## Tasks / Subtasks

- [x] Task 1 : Modèle de données liaison tenant ↔ numéro WhatsApp (AC: #1)
  - [x] Ajouter au schéma Prisma la config de liaison : numéro WhatsApp (E.164) et/ou Twilio Phone SID par tenant (champs sur Tenant ou table dédiée `tenant_messaging_config` selon archi §7.1) ; contrainte : un numéro ne peut être lié qu’à un seul tenant (unicité)
  - [x] Migration Prisma sans casser les données existantes
- [x] Task 2 : API tRPC pour la config WhatsApp du tenant (AC: #1)
  - [x] Router tRPC protégé (protectedProcedure) : getWhatsAppConfig (lecture), setWhatsAppConfig (écriture) ; tenantId uniquement depuis ctx.session.user.tenantId
  - [x] Validation Zod : numéro E.164 ; TRPCError en cas d’erreur ; refus si numéro déjà utilisé par un autre tenant
- [x] Task 3 : Section Paramètres / WhatsApp dans le dashboard (AC: #1)
  - [x] Ajouter une section « Connexion WhatsApp » sur la page Paramètres (ex. `src/app/(dashboard)/parametres/` ou sous-page dédiée) ; accès Owner/Manager (canManageGrid ou rôle équivalent)
  - [x] Formulaire : champ **numéro WhatsApp** (format international E.164) ; chargement via tRPC ; pas de champ « code Twilio » ou « SID » exposé au vendeur., enregistrement via mutation ; message clair en cas de succès ou d’erreur (ex. numéro déjà utilisé)
  - [x] UI : shadcn/ui + Tailwind (Input, Button, Label, Card) ; cohérence avec grille de prix et frais de livraison
- [x] Task 4 : RBAC et navigation (AC: #1)
  - [x] Même règle d’accès que la grille / livraison : Owner/Manager uniquement ; pas d’accès Agent pour la config WhatsApp
  - [x] Lien ou onglet visible dans Paramètres ; la section WhatsApp est accessible depuis la même zone que le reste de la config

## Dev Notes

- **FR couvert** : FR4 — Le vendeur peut connecter **son numéro WhatsApp** à son tenant. Les messages entrants seront attribués à ce tenant (FR6) via le webhook (Epic 2) . Cette story ne crée pas le webhook ni les workers, uniquement la config côté dashboard et la persistance du lien tenant ↔ numéro.
- **Qui a le compte Twilio ?** La **plateforme SnapSell** (variables d'env TWILIO_*). Le **vendeur n'a pas besoin** d'un compte Twilio ni de saisir des codes : il saisit uniquement **son numéro WhatsApp** (E.164). Pas de champ SID ou token exposé dans l'UI vendeur.
- **Stack (archi §11)** : T3 sur Vercel ; pas de workers dans cette story. Données en Postgres (Neon) via Prisma ; API dashboard via tRPC protégée par session.
- **Architecture §7.1 (provider-agnostic)** : La config « numéro ↔ tenant » vit dans la config tenant ou une table dédiée (`tenant_messaging_config`). On stocke le numéro E.164 pour résoudre le tenant depuis le champ « To » du webhook (Epic 2).
- **Sécurité (archi §10)** : Isolation tenant stricte ; tenantId uniquement depuis la session ; pas d’API publique. Les secrets Twilio (Account SID, Auth Token) restent en variables d’environnement (Vercel/Railway), pas en base par tenant pour le MVP sauf décision explicite produit.
- **UI :** Pour toute story avec interface utilisateur (formulaires, pages, dashboard), utiliser **shadcn/ui + Tailwind** comme base (composants Input, Button, Label, Card, etc.) pour cohérence et accessibilité.

### Project Structure Notes

- **Story 1.4 / 1.5** : Page `parametres/` avec grille catégories→prix et (optionnel) page/section Frais de livraison ; router `settings` et `delivery` ; RBAC `canManageGrid` dans `~/lib/rbac`.
- **Cette story** : réutiliser la même zone Paramètres (page ou sous-page) et le même type de RBAC (Owner/Manager) ; ajouter section ou page « Connexion WhatsApp » avec formulaire numéro WhatsApp et procedures tRPC dédiées (ex. `settings.getWhatsAppConfig` / `setWhatsAppConfig` ou router `whatsapp`).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 1, Story 1.6] — User story et critères d’acceptation
- [Source: _bmad-output/planning-artifacts/architecture.md#7.1 Messaging provider-agnostic] — Config BSP dans config tenant ou table dédiée ; mapping tenant
- [Source: _bmad-output/planning-artifacts/architecture.md#11.3 Variables d’environnement] — TWILIO_* côté app ; pas de stockage des secrets par tenant en MVP sauf exigence produit

---

## Developer Context (guardrails pour l’agent dev)

### Contexte métier

- **Objectif** : Un vendeur connecté au dashboard peut **associer son numéro WhatsApp à son tenant**. Il saisit uniquement le numéro (format international E.164) ; il n’a pas besoin d’un compte Twilio ni de codes. Ce numéro est enregistré pour que, lorsque le webhook (Epic 2) recevra des messages, le système puisse attribuer ces messages au bon tenant (FR6). Cette story ne met en place que la configuration et la persistance du lien tenant ↔ numéro.
- **Valeur** : FR4 couvert ; prérequis pour Epic 2 (réception et envoi WhatsApp).

### Ce qui existe déjà (Stories 1.1–1.5)

- **Auth** : NextAuth Credentials + JWT ; session avec tenantId et role (Owner, Manager, Vendeur, Agent).
- **tRPC** : `protectedProcedure` ; `ctx.session.user.tenantId` pour isolation tenant.
- **Prisma** : Tenant, User, CategoryPrice, DeliveryZone, DeliveryZoneCommune, DeliveryFeeCommune ; pas de champ WhatsApp/Twilio sur Tenant pour l’instant.
- **Page Paramètres** : `src/app/(dashboard)/parametres/` (grille de prix, éventuellement page livraison) ; accès protégé par `canManageGrid` (Owner/Manager).
- **Routers** : `settings` (getCategoryPrices, setCategoryPrices), `delivery` (zones, communes, intérieur) ; RBAC centralisé dans `~/lib/rbac`.

### Pièges à éviter

- **Ne pas** accepter tenantId depuis le body ou les query params : uniquement depuis `ctx.session.user.tenantId`.
- **Ne pas** implémenter le webhook Twilio ni les workers dans cette story : uniquement la config (saisie + persistance) côté dashboard.
- **Ne pas** stocker les secrets Twilio (Account SID, Auth Token) en base par tenant en MVP sauf exigence produit explicite ; ils restent en env (archi §11.3).
- **Ne pas** dupliquer la logique RBAC : réutiliser `canManageGrid` (ou le même ensemble de rôles) pour la config WhatsApp, comme pour la grille et la livraison.
- **Unicité** : un même numéro ne doit pas être lié à deux tenants différents ; vérifier en base avant d’enregistrer et retourner une erreur claire si déjà utilisé.

### Dépendances techniques

- **Prisma** : Ajouter champ numéro WhatsApp sur Tenant (ex. `whatsappPhoneNumber String? @map("whatsapp_phone_number")`) ou table dédiée `TenantMessagingConfig` (tenant_id, phone_number E.164) avec contrainte UNIQUE sur phone_number. Optionnel : champ technique `twilioPhoneSid` si la plateforme le renseigne côté back-office (pas saisi par le vendeur). Migration sans données existantes à migrer.
- **tRPC** : Étendre le router `settings` (ou nouveau router `whatsapp`) avec `getWhatsAppConfig` et `setWhatsAppConfig` (protectedProcedure, RBAC canManageGrid). Validation Zod : numéro E.164 (regex ou lib).
- **Webhook (Epic 2)** : utilisera cette config pour résoudre `tenant_id` à partir du champ « To » du webhook ; hors scope de cette story.

### Fichiers à créer / modifier (indicatif)

- **Modifier** : `prisma/schema.prisma` — ajout champs WhatsApp/Twilio sur Tenant ou modèle TenantMessagingConfig ; migration.
- **Modifier** : `src/server/api/routers/settings.ts` (ou nouveau `whatsapp.ts`) — getWhatsAppConfig, setWhatsAppConfig ; même RBAC que grille/livraison.
- **Modifier** : schéma Zod associé (ex. `settings.schema.ts` ou `whatsapp.schema.ts`) — validation numéro E.164.
- **Modifier** : `src/app/(dashboard)/parametres/page.tsx` ou ajout page/section — section « Connexion WhatsApp » avec formulaire.
- **Créer (optionnel)** : `src/app/(dashboard)/parametres/_components/whatsapp-config-content.tsx` — formulaire numéro WhatsApp (E.164), tRPC get/set, shadcn/ui.
- **Ne pas** modifier : route webhook (`src/app/api/webhooks/twilio/`), workers ; c’est l’objet de l’Epic 2.

### Conformité architecture

- **Stack** : Vercel, Neon, Prisma, tRPC, Zod. Pas de workers dans cette story.
- **Sécurité** : Isolation tenant ; RBAC Owner/Manager pour config WhatsApp (même que grille/livraison).
- **Patterns** : DB snake_case ; Prisma @map ; Zod pour validation ; TRPCError pour erreurs.
- **§7.1** : Config BSP (numéro/SID) dans config tenant ou table dédiée ; pas de logique métier dépendante du SDK Twilio dans cette story.

### Exigences librairies / frameworks

- **Prisma, Zod, tRPC** : déjà utilisés ; pas de nouvelle dépendance obligatoire. Optionnel : lib de validation E.164 si besoin.
- **UI** : shadcn/ui + Tailwind pour la section Connexion WhatsApp, cohérent avec le reste du dashboard.

### Structure des fichiers (rappel)

- `src/app/(dashboard)/parametres/` — page(s) de configuration (grille, livraison, WhatsApp).
- `src/server/api/routers/settings.ts` ou `whatsapp.ts` — procedures getWhatsAppConfig / setWhatsAppConfig.
- `prisma/schema.prisma` — champs ou modèle pour liaison tenant ↔ numéro/SID ; migrations dans `prisma/migrations/`.

### Tests (optionnel MVP)

- Test unitaire sur le schéma Zod (format E.164). Optionnel : test d’intégration tRPC get/set avec tenantId depuis contexte ; test d’unicité (refus si numéro déjà utilisé par un autre tenant).

---

## Technical Requirements (Dev Agent Guardrails)

- **Isolation tenant** : getWhatsAppConfig / setWhatsAppConfig doivent utiliser uniquement `ctx.session.user.tenantId` (where / data). Ne jamais faire confiance au client pour tenantId.
- **Modèle de données** : Stocker le numéro WhatsApp (E.164) et/ou le Twilio Phone SID ; contrainte d’unicité pour qu’un numéro/SID ne soit lié qu’à un seul tenant.
- **Paramètres** : Section ou page « Connexion WhatsApp » dans la zone Paramètres ; même accès (canManageGrid) que grille et livraison.
- **Pas de webhook ni workers** : Cette story ne crée pas la route `/api/webhooks/twilio` ni les jobs BullMQ ; uniquement la config dashboard et la persistance du lien tenant ↔ numéro.

---

## Architecture Compliance

- **§10 Security** : Isolation tenant + RBAC ; accès config WhatsApp réservé aux rôles autorisés (Owner, Manager), comme la grille et la livraison.
- **§7.1 Messaging provider-agnostic** : Config « numéro ↔ tenant » dans config tenant ou table dédiée ; pas de dépendance métier au SDK Twilio dans cette story. Le vendeur ne saisit que le numéro (E.164).
- **Implementation Patterns** : tenantId depuis session ; naming DB snake_case, Prisma @map ; Zod pour validation ; TRPCError pour erreurs.
- **§11 Stack** : Vercel, Prisma, tRPC ; pas de workers dans cette story.
- **§8 Data Storage** : Nouveaux champs ou table pour liaison tenant ↔ numéro/SID ; contrainte UNIQUE pour éviter double attribution.

---

## Library & Framework Requirements

- Prisma (existant), Zod (existant), tRPC (existant). Aucune nouvelle dépendance obligatoire.
- UI : shadcn/ui + Tailwind pour la section Connexion WhatsApp, cohérent avec pricing-grid et delivery-fees.

---

## File Structure Requirements

- **Modifications** : `prisma/schema.prisma`, `prisma/migrations/...`, `src/server/api/routers/settings.ts` (ou nouveau router `whatsapp.ts`), schéma Zod associé, `src/app/(dashboard)/parametres/page.tsx` ou nouvelle page/section.
- **Optionnel** : `src/app/(dashboard)/parametres/_components/whatsapp-config-content.tsx` si on extrait le formulaire en composant.
- Ne pas créer la route `/api/webhooks/twilio` ni les workers dans cette story.

---

## Testing Requirements

- Optionnel : validation Zod (format E.164). Unicité : refus si numéro déjà utilisé par un autre tenant. Pas de régression sur grille, livraison, auth/tenant.

---

## Previous Story Intelligence

- **Story 1.5** : Frais de livraison — page dédiée `/parametres/livraison`, router `delivery`, modèles DeliveryZone, DeliveryZoneCommune, DeliveryFeeCommune, composant `delivery-fees-content.tsx` ; RBAC canManageGrid ; tenantId depuis session. Pour 1.6 : réutiliser le même pattern (section ou page sous Paramètres, même RBAC, router dédié ou extension settings), formulaire simple (un ou deux champs), shadcn/ui. Fichiers créés en 1.5 : `delivery.ts`, `delivery.schema.ts`, `delivery-fees-content.tsx`, `parametres/livraison/page.tsx`, sidebar avec lien « Frais de livraison ». Pour 1.6 : ne pas dupliquer la logique RBAC ; réutiliser canManageGrid pour la section WhatsApp.
- **Story 1.4** : Grille catégories→prix dans `parametres/` avec `PricingGridContent` ; router `settings` ; même RBAC. Cohérence : une section ou onglet « WhatsApp » à côté de la grille et de la livraison garde l’UX prévisible.

---

## Git Intelligence Summary

- Derniers commits : initialisation T3 (Story 1.1) ; travail récent sur livraison (1.5) et paramètres. Patterns établis : Prisma migrations, routers tRPC protégés, composants sous `_components/`, RBAC centralisé. Pour 1.6 : suivre les mêmes patterns (router + schema Zod + composant UI sous parametres).

---

## Latest Tech Information

- **Twilio WhatsApp** : Pour le MVP, la liaison tenant ↔ numéro suffit ; le webhook (Epic 2) utilisera le champ « To » de la requête pour résoudre le tenant. Pas besoin d’appeler l’API Twilio dans cette story pour « vérifier » le numéro sauf exigence produit (optionnel : validation que le SID existe côté Twilio).
- **E.164** : Format recommandé pour le numéro (ex. +33612345678) pour éviter ambiguïtés ; validation Zod ou regex simple.

---

## Project Context Reference

- **Artefacts BMAD** : `_bmad-output/planning-artifacts/` (prd.md, architecture.md, epics.md) ; `_bmad-output/implementation-artifacts/` (sprint-status.yaml, stories 1-1 à 1-5).
- **Conventions** : document_output_language French ; stack T3 + NextAuth + Prisma ; UI shadcn/ui + Tailwind.

---

## Story Completion Status

- **Status** : done
- **Completion note** : Implémentation et CR complétés. Toutes les corrections CR appliquées (P2002, File List, tâches cochées, schema E.164 partagé, synchro initiale seule, tests Zod).

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- CR 2026-02-05 : P2002 géré dans settings.ts ; File List et tâches mis à jour ; e164PhoneSchema avec E164_REGEX partagé ; synchro serveur→local au premier chargement uniquement (useRef) ; tests unitaires E.164 ajoutés (settings.schema.test.ts).

### Code Review (AI)

- **CR** : `_bmad-output/implementation-artifacts/1-6-connecter-whatsapp-twilio-au-tenant-CR.md` (2026-02-05). Toutes les corrections appliquées.

### File List

- `prisma/schema.prisma` — champ `whatsappPhoneNumber` sur Tenant (unique, @map).
- `prisma/migrations/20260205120000_add_tenant_whatsapp_phone/migration.sql`
- `src/server/api/routers/settings.ts` — getWhatsAppConfig, setWhatsAppConfig ; gestion P2002.
- `src/server/api/routers/settings.schema.ts` — E164_REGEX, e164PhoneSchema, setWhatsAppConfigInputSchema.
- `src/server/api/routers/settings.schema.test.ts` — tests unitaires E.164 et setWhatsAppConfigInputSchema.
- `src/app/(dashboard)/parametres/whatsapp/page.tsx`
- `src/app/(dashboard)/parametres/_components/whatsapp-config-content.tsx` — synchro initiale seule (useRef).
- `src/app/(dashboard)/_components/app-sidebar.tsx` — lien Connexion WhatsApp, requiresGridRole.
