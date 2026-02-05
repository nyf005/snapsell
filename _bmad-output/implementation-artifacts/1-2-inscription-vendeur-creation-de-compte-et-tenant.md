# Story 1.2: Inscription vendeur (création de compte et tenant)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **vendeur**,
I want **m'inscrire et créer mon espace (tenant)**,
so that **j'aie un espace isolé pour vendre**.

## Acceptance Criteria

1. **Given** une page ou un flux d'inscription (email/mot de passe ou équivalent)  
   **When** je remplis les champs requis et je soumets  
   **Then** un tenant et un user (rôle vendeur/owner) sont créés en base, associés  
   **And** je peux me connecter au dashboard (session créée)  
   **And** FR1 couvert

## Tasks / Subtasks

- [x] Task 1 : Page/flux d'inscription (AC: #1)
  - [x] Créer une route d'inscription (ex. `src/app/(auth)/signup/` ou équivalent) avec formulaire email + mot de passe (ou équivalent)
  - [x] Valider les champs côté client et serveur (Zod)
  - [x] Soumission : créer Tenant + User en une transaction, lier User au Tenant avec rôle owner/vendeur
- [x] Task 2 : Persistance Tenant + User et rôle (AC: #1)
  - [x] S'assurer que le schéma Prisma permet un rôle sur User (ex. champ `role` ou table roles) ; étendre si besoin (Owner pour le créateur du tenant)
  - [x] À l'inscription : création atomique d'un Tenant puis d'un User avec `tenantId` et rôle owner
  - [x] Ne pas exposer d'API publique d'inscription sans rate-limit / captcha en tête pour plus tard (MVP : formulaire simple)
- [x] Task 3 : Session et accès dashboard après inscription (AC: #1)
  - [x] Après création réussie : créer une session (NextAuth ou mécanisme d'auth choisi) et rediriger vers le dashboard
  - [x] Vérifier que les requêtes dashboard sont filtrées par `tenantId` (isolation tenant) — préparation pour story 1.3
  - [x] Documenter dans la story ou Dev Notes comment la session est liée au tenant (ctx tenant dans tRPC)
  - **Review Follow-ups (AI)**
    - [x] [AI-Review][Medium] Test d’intégration ou unitaire sur la mutation `auth.signup` (création Tenant+User, doublon email)
    - [x] [AI-Review][Low] (Optionnel) Partager le schéma de validation signup client/serveur

## Dev Notes

- **FR1** : Le vendeur peut s'inscrire et créer un tenant (espace isolé). Cette story couvre uniquement l'inscription + création tenant/user + première session ; la « connexion » réutilisable (login) est en story 1.3.
- **Stack (archi §11)** : T3 sur Vercel ; auth recommandée = NextAuth avec adaptateur Prisma (déjà aligné T3). Session = lien user → tenant pour isolation.
- **Modèle de domaine (archi §3)** : Tenants, Users, Roles (Owner, Manager, Vendeur, Agent). Pour cette story : au minimum Owner (ou vendeur) pour l'utilisateur créé à l'inscription.
- **Sécurité (archi §10)** : Isolation tenant + RBAC ; pas d'API publique en MVP ; mots de passe hashés (bcrypt ou équivalent fourni par NextAuth).
- **Conventions (archi Implementation Patterns)** : DB snake_case, Prisma @map ; validation Zod sur input inscription ; TRPCError pour erreurs API.
- **UI :** shadcn/ui + Tailwind comme base pour toutes les interfaces (formulaires, pages, dashboard). Utiliser les composants `~/components/ui` (Input, Button, Label, Card, etc.) pour cohérence et accessibilité.

### Project Structure Notes

- **Story 1.1** a mis en place : `src/app`, `src/server`, `prisma`, modèles `Tenant` et `User` avec `tenant_id` sur User. Pas de route webhook ni workers.
- **Cette story** : ajouter `src/app/(auth)/signup/` (ou `register/`), éventuellement `src/app/(auth)/login/` en squelette si NextAuth le requiert ; router tRPC pour l'inscription (ex. `auth.signup` ou `tenant.createWithOwner`) ; étendre le schéma Prisma si besoin (champ `role` sur User ou table `user_roles`). Ne pas implémenter la grille catégories/prix ni WhatsApp (stories suivantes).
- Référence : [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 1, Story 1.2] — User story et critères d'acceptation
- [Source: _bmad-output/planning-artifacts/architecture.md#10. Security] — Isolation tenant, RBAC, secrets, PII
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules] — Naming, structure, Zod, tRPC

---

## Developer Context (guardrails pour l’agent dev)

### Contexte métier

- **Objectif** : Un vendeur s’inscrit une seule fois ; un **tenant** (boutique/espace) et un **user** (propriétaire) sont créés. La session est créée immédiatement pour qu’il accède au dashboard sans étape « login » supplémentaire après inscription.
- **Valeur** : FR1 (inscription + création tenant) ; base pour toutes les stories suivantes (connexion, config grille, WhatsApp, etc.).

### Ce qui existe déjà (Story 1.1)

- Projet T3 initialisé (Next.js App Router, Prisma, Tailwind).
- Schéma Prisma : `Tenant` et `User` avec relation `User.tenantId` → `Tenant`. Tables en snake_case (`tenants`, `users`, `tenant_id`, `created_at`, `updated_at`).
- Pas encore d’auth (NextAuth) ni de routes (auth)/signup ou (auth)/login.
- Fichiers pertinents : `prisma/schema.prisma`, `src/server/db.ts`, `src/server/api/root.ts`, `src/env.js`, `.env.example` (DATABASE_URL).

### Pièges à éviter

- **Ne pas** créer d’API d’inscription publique sans garde-fou (MVP = formulaire web ; rate-limit/captcha en post-MVP).
- **Ne pas** oublier la transaction : création Tenant + User atomique (rollback si échec User).
- **Ne pas** stocker le mot de passe en clair ; utiliser le hashing fourni par NextAuth (ou bcrypt) et bonnes pratiques (salt, coût).
- **Ne pas** exposer `tenantId` depuis le body client ; le dériver de la session (ctx) après auth.

### Dépendances techniques

- **NextAuth** (recommandé avec T3) : configurer provider Credentials ou autre ; adaptateur Prisma pour stocker sessions/users si besoin ; callbacks pour injecter `tenantId` dans la session.
- **Prisma** : étendre le schéma si besoin (ex. `User.role` enum ou table `user_roles`) pour Owner/vendeur ; migrations avec `prisma migrate dev`.
- **tRPC** : procédure d’inscription (ex. `auth.signup` ou `tenant.createWithOwner`) avec input Zod (email, password, nom du tenant par ex.) ; pas d’appel tRPC « public » non protégé sans mesure anti-abus en tête pour la suite.

### Fichiers à créer / modifier (indicatif)

- **Créer** : `src/app/(auth)/signup/page.tsx` (ou équivalent) — formulaire inscription.
- **Créer** : `src/server/api/routers/auth.ts` (ou étendre un router existant) — procédure signup (création Tenant + User, hash password, création session).
- **Modifier** : `prisma/schema.prisma` — ajouter `role` sur User (ou modèle Role) si pas encore présent.
- **Créer / modifier** : configuration NextAuth (ex. `src/server/auth.ts` ou `src/app/api/auth/[...nextauth]/route.ts`) — provider, adapter Prisma, callbacks session (tenantId).
- **Modifier** : `src/server/api/root.ts` — enregistrer le router auth.
- **Créer** : layout ou redirection post-signup vers dashboard (ex. `src/app/(dashboard)/layout.tsx` ou page d’accueil protégée).

### Conformité architecture

- **Stack** : Vercel (web), Neon (Postgres), Prisma, Zod, tRPC. Pas de workers ni webhook dans cette story.
- **Sécurité** : Isolation tenant (toutes les requêtes dashboard filtrées par `tenantId` issu de la session) ; RBAC minimal (rôle Owner pour l’inscrit).
- **Patterns** : DB snake_case ; Prisma @map ; Zod pour validation ; TRPCError pour erreurs ; pas de logique métier lourde dans une route API « web » (tout dans tRPC ou server services).

### Exigences librairies / frameworks

- **NextAuth** : version compatible T3/Next.js 14+ ; adapter Prisma pour synchroniser User/Tenant si besoin.
- **Prisma** : déjà en place ; utiliser `prisma.$transaction` pour Tenant + User.
- **Zod** : schémas pour email, password (longueur min, complexité si exigée), nom tenant.

### Structure des fichiers (rappel)

- `src/app/(auth)/` — routes non protégées (signup, login).
- `src/app/(dashboard)/` — routes protégées (à filtrer par tenant après auth).
- `src/server/api/routers/` — routers tRPC (auth, plus tard tenant, orders, etc.).
- `prisma/schema.prisma` — modèles Tenant, User (et rôle si séparé).

### Tests (optionnel MVP)

- Pas exigé pour cette story par l’epic ; recommandation : test unitaire ou intégration sur la procédure signup (création Tenant + User, pas de doublon email si contrainte unique).

---

## Project Context Reference

- **project-context** : À créer ou référencer sous `docs/` ou `_bmad-output/` si le projet dispose d’un fichier project-context.md (conventions d’équipe, env, liens).
- **Artefacts BMAD** : `_bmad-output/planning-artifacts/` (prd.md, architecture.md, epics.md) ; `_bmad-output/implementation-artifacts/` (sprint-status.yaml, stories 1-1, 1-2).

---

## Story Completion Status

- **Status** : review  
- **Completion note** : Inscription vendeur implémentée (signup, NextAuth Credentials, session DB, dashboard). Tests : 5 schéma signup + 2 mutation signup (7 au total).  
- **Next** : Story 1.3 (connexion / login).

## Senior Developer Review (AI)

**Date :** 2026-02-04  
**Outcome :** Changes Requested → corrigé en session (TypeScript + doc). Follow-ups traités : tests mutation signup + schéma partagé.

### Synthèse

- **Git vs File List :** Cohérent après ajout de `src/app/page.tsx` à la File List (fichier modifié en git, omis auparavant).
- **AC #1 :** Implémenté (page signup, tenant+user en transaction, session créée, redirection dashboard).
- **Tâches [x] :** Vérifiées conformes au code. Action Items alignés [x] (tests mutation + schéma partagé déjà faits).

### Problèmes identifiés

| Sévérité | Problème | Statut |
|----------|----------|--------|
| 🔴 HIGH | Erreurs TypeScript dans `src/server/auth.ts` (augmentation `next-auth/jwt` introuvable, type `role` ligne 71) → build/CI en échec | ✅ Corrigé (src/types/next-auth.d.ts, Object.assign session) |
| 🟡 MEDIUM | Completion Notes indiquaient "strategy database" alors que l’implémentation utilise JWT | ✅ Corrigé (doc mise à jour) |
| 🟡 MEDIUM | Aucun test d’intégration sur la procédure signup (création Tenant+User, doublon email) ; seulement schéma Zod | Action item |
| 🟢 LOW | Duplication validation : `signupSchema` (client) et `signupInputSchema` (Zod serveur) — risque de divergence | Optionnel |

### Action Items

- [x] [AI-Review][Medium] Ajouter un test d’intégration ou unitaire sur la mutation `auth.signup` (création Tenant+User, rejet si email déjà existant) — voir auth.test.ts / auth.ts
- [x] [AI-Review][Low] (Optionnel) Réutiliser ou partager le schéma de validation signup entre client et serveur pour éviter la duplication (signup/page.tsx vs auth.schema.ts)

### Fichiers modifiés lors du CR

- src/server/auth.ts (callbacks session : Object.assign, typage)
- src/types/next-auth.d.ts (nouveau — augmentation JWT)

### Corrections post-CR (action items)

- **Test mutation signup** : `src/server/api/routers/auth.mutation.test.ts` (mock db, cas succès + email déjà existant → CONFLICT).
- **Schéma partagé** : `src/lib/validations/signup.ts` (signupInputSchema + getSignupValidationErrors) ; page signup utilise getSignupValidationErrors ; auth.schema.ts réexporte depuis lib.

### CR 2026-02-04 (second pass)

- **Corrections appliquées** : Action Items marqués [x] ; Completion note mise à jour (7 tests) ; `src/app/page.tsx` ajouté à la File List.
- **Corrections auto (choix 1)** : AUTH_SECRET requis en production (`src/env.js` : `.refine()` sur NODE_ENV) ; cast `session.user` supprimé sur dashboard ; test mutation : `expect(mockHash).toHaveBeenCalledWith("password123", 10)`.
<!-- AUTH_SECRET + cast + bcrypt assertions corrigés ci-dessus -->

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- **Session ↔ tenant** : NextAuth (strategy **JWT**) avec callbacks `jwt` et `session` qui enrichissent `session.user` avec `tenantId` et `role` (depuis le token). La page dashboard utilise `auth()` et affiche `session.user.tenantId`. Pour tRPC, le contexte pourra être étendu en story 1.3 avec session dans `createTRPCContext` et procédures protégées filtrées par `tenantId`.
- Implémentation : route `(auth)/signup`, formulaire + validation Zod client/serveur (schéma partagé `~/lib/validations/signup` + getSignupValidationErrors), `auth.signup` tRPC (transaction Tenant+User, bcrypt), NextAuth Credentials (JWT), callbacks session (tenantId/role), redirection post-signup vers `/dashboard`, page dashboard protégée par `auth()`. UI signup avec **shadcn/ui + Tailwind**. Tests : 5 sur schéma + 2 sur mutation signup (mock db, doublon email).

### File List

- prisma/schema.prisma (étendu : Role, User.role, User.passwordHash, User.emailVerified, User.image, Account, Session, VerificationToken)
- prisma/migrations/20260204120000_add_auth_role_nextauth/migration.sql (nouvelle migration)
- src/env.js (AUTH_SECRET)
- .env.example (AUTH_SECRET)
- src/server/auth.ts (nouveau)
- src/types/next-auth.d.ts (nouveau — augmentation JWT NextAuth)
- src/server/api/routers/auth.ts (nouveau)
- src/lib/validations/signup.ts (nouveau — schéma Zod partagé + getSignupValidationErrors)
- src/server/api/routers/auth.schema.ts (réexporte ~/lib/validations/signup)
- src/server/api/routers/auth.test.ts (tests schéma)
- src/server/api/routers/auth.mutation.test.ts (nouveau — tests mutation signup, mock db)
- src/server/api/root.ts (auth router)
- src/app/api/auth/[...nextauth]/route.ts (nouveau)
- src/app/(auth)/signup/page.tsx (refactor shadcn : Card, Input, Label, Button)
- src/app/(dashboard)/dashboard/page.tsx (nouveau)
- src/app/layout.tsx (SessionProvider, metadata)
- src/app/page.tsx (home : style auth-page-bg, tRPC hello)
- src/styles/globals.css (variables shadcn + tw-animate-css)
- src/lib/utils.ts (cn, shadcn)
- src/components/ui/button.tsx, input.tsx, label.tsx, card.tsx (shadcn)
- components.json (config shadcn)
- package.json (next-auth, @auth/prisma-adapter, bcrypt, vitest, shadcn deps : class-variance-authority, clsx, radix-ui, tailwind-merge, tw-animate-css, lucide-react)
- vitest.config.ts (nouveau)
