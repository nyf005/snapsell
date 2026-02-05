# Story 1.3: Connexion au dashboard (authentification)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **vendeur, manager ou agent**,
I want **me connecter au dashboard**,
so that **j'accède à mon espace (tenant) de façon sécurisée**.

## Acceptance Criteria

1. **Given** un compte existant (user + tenant)  
   **When** je saisis mes identifiants et je me connecte  
   **Then** une session est créée et je suis redirigé vers le dashboard  
   **And** toutes les requêtes côté dashboard sont filtrées par mon tenant_id (isolation tenant)  
   **And** je peux me déconnecter

## Tasks / Subtasks

- [x] Task 1 : Page et flux de connexion (AC: #1)
  - [x] Créer la route `src/app/(auth)/login/page.tsx` avec formulaire email + mot de passe
  - [x] Valider les champs côté client et serveur (Zod) ; réutiliser ou partager les schémas existants si pertinent (ex. email)
  - [x] Soumission : appeler NextAuth signIn avec Credentials ; en cas de succès, redirection vers `/dashboard` (ou callbackUrl)
- [x] Task 2 : Session et isolation tenant (AC: #1)
  - [x] S'assurer que le provider NextAuth Credentials (déjà configuré en 1.2) accepte email/password et vérifie le mot de passe (bcrypt) ; retourner user + tenantId + role pour les callbacks JWT/session
  - [x] Vérifier que `createTRPCContext` injecte la session et que les procédures protégées du dashboard utilisent `ctx.session.user.tenantId` pour filtrer toutes les requêtes (isolation tenant)
  - [x] Documenter ou renforcer : aucune donnée dashboard ne doit être accessible sans session valide ; aucune requête tRPC protégée sans filtre tenant_id
- [x] Task 3 : Déconnexion (AC: #1)
  - [x] Exposer un bouton ou lien « Déconnexion » sur le dashboard (ou layout) appelant `signOut()` NextAuth
  - [x] Après déconnexion : redirection vers la page d'accueil ou `/login`

## Dev Notes

- **FR couvert** : Connexion vendeur/manager/agent au dashboard (login). Story 1.2 a livré l'inscription + création tenant/user + première session ; cette story livre le **login réutilisable** et confirme l'isolation tenant sur toutes les requêtes dashboard.
- **Stack (archi §11)** : T3 sur Vercel ; NextAuth avec Credentials + JWT déjà en place (story 1.2). Réutiliser la même config (auth.ts, callbacks jwt/session) ; ajouter la page login et s'assurer que le contexte tRPC et les procédures protégées filtrent par `tenantId`.
- **Modèle de domaine** : User lié à un Tenant ; rôles Owner, Manager, Vendeur, Agent. La session doit contenir `tenantId` et `role` (déjà prévus en 1.2).
- **Sécurité (archi §10)** : Isolation tenant + RBAC ; mots de passe vérifiés via bcrypt (NextAuth/Credentials) ; pas d'API publique pour le login (formulaire web uniquement).
- **UI :** shadcn/ui + Tailwind comme base. Utiliser les composants `~/components/ui` (Input, Button, Label, Card) pour la page login, cohérence avec signup.

### Project Structure Notes

- **Story 1.1–1.2** : `src/app/(auth)/signup/`, `src/app/(dashboard)/dashboard/page.tsx`, `src/server/auth.ts`, `src/server/api/routers/auth.ts`, NextAuth JWT avec tenantId/role en session. Pas de route `(auth)/login` complète encore.
- **Cette story** : ajouter `src/app/(auth)/login/page.tsx` (formulaire connexion), étendre ou vérifier `createTRPCContext` pour passer la session et garantir le filtre tenant sur les procédures protégées ; bouton déconnexion dans le layout dashboard ou la page dashboard.
- Référence : [Source: _bmad-output/planning-artifacts/architecture.md#Project Structure & Boundaries]

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 1, Story 1.3] — User story et critères d'acceptation
- [Source: _bmad-output/planning-artifacts/architecture.md#10. Security] — Isolation tenant, RBAC
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules] — Naming, structure, Zod, tRPC

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **Objectif** : Un vendeur, manager ou agent avec un compte existant peut **se connecter** (email + mot de passe), obtenir une session, être redirigé vers le dashboard, et toutes les données vues côté dashboard sont **strictement filtrées par son tenant_id**. Il peut se déconnecter.
- **Valeur** : Accès sécurisé et multi-tenant au dashboard ; base pour les stories de configuration (grille, livraison, WhatsApp) et d'ops (commandes, proofs).

### Ce qui existe déjà (Stories 1.1 et 1.2)

- NextAuth configuré avec **Credentials** et **JWT** : `src/server/auth.ts`, callbacks `jwt` et `session` qui ajoutent `tenantId` et `role` à `session.user`.
- Route signup : `src/app/(auth)/signup/page.tsx` ; après inscription, session créée et redirection vers `/dashboard`.
- Page dashboard : `src/app/(dashboard)/dashboard/page.tsx` protégée par `auth()` ; affiche `session.user`.
- tRPC : router `auth` avec `signup` ; **à vérifier/étendre** : `createTRPCContext` doit recevoir la session (getServerSession ou auth()) et les procédures protégées doivent utiliser `ctx.session.user.tenantId` pour toute requête DB.
- Schéma Prisma : User (email, passwordHash, tenantId, role), Tenant ; tables NextAuth (Account, Session, VerificationToken) si adaptateur DB utilisé, ou JWT seul (session en token).

### Pièges à éviter

- **Ne pas** exposer de procédure tRPC « dashboard » sans vérifier la session et sans filtrer par `tenantId` (risque de fuite cross-tenant).
- **Ne pas** réimplémenter une couche auth différente : réutiliser NextAuth Credentials + les mêmes callbacks que en 1.2.
- **Ne pas** oublier la page login : l'utilisateur qui a déjà un compte doit pouvoir se connecter sans repasser par signup.
- **Ne pas** dériver `tenantId` depuis le body ou les query params ; uniquement depuis `ctx.session.user.tenantId`.

### Dépendances techniques

- **NextAuth** : même config que 1.2 ; provider Credentials avec `authorize` qui vérifie email/password (bcrypt.compare), charge le User (et Tenant si besoin) et retourne { id, email, tenantId, role } pour le token JWT.
- **tRPC** : `createTRPCContext` doit appeler `auth()` (ou getServerSession) et passer `session` dans le contexte ; créer un helper `protectedProcedure` qui exige `ctx.session` et optionnellement injecte `tenantId` pour les requêtes.
- **Prisma** : toutes les requêtes dans les routers « dashboard » (futurs ou existants) doivent inclure `where: { tenantId: ctx.session.user.tenantId }` (ou équivalent selon le modèle).

### Fichiers à créer / modifier (indicatif)

- **Créer** : `src/app/(auth)/login/page.tsx` — formulaire email + mot de passe, appel à `signIn("credentials", { email, password, callbackUrl: "/dashboard" })`, affichage erreur si identifiants invalides.
- **Modifier** : `src/server/auth.ts` — s'assurer que le provider Credentials est configuré pour le **login** (authorize : lookup User par email, bcrypt.compare(password, user.passwordHash), retourner { id, email, tenantId, role }). Déjà partiellement en place si signup crée la session ; vérifier le flux « login sans signup ».
- **Modifier** : `src/server/api/trpc.ts` (ou équivalent) — `createTRPCContext` : récupérer la session (auth()) et l'ajouter à `ctx` ; ajouter une `protectedProcedure` qui vérifie `ctx.session` et lance UNAUTHORIZED si absent.
- **Modifier** : `src/app/(dashboard)/layout.tsx` ou `dashboard/page.tsx` — ajouter un bouton/lien « Déconnexion » qui appelle `signOut()` (client-side depuis next-auth/react).
- **Vérifier** : toutes les procédures tRPC qui servent des données « dashboard » (même futures) doivent être protégées et utiliser `ctx.session.user.tenantId` dans les requêtes.

### Conformité architecture

- **Stack** : Vercel, Neon, Prisma, NextAuth, Zod, tRPC. Pas de workers ni webhook dans cette story.
- **Sécurité** : Isolation tenant sur toutes les requêtes ; RBAC (role dans la session pour usage futur).
- **Patterns** : DB snake_case ; Prisma @map ; Zod pour validation login ; TRPCError pour erreurs (UNAUTHORIZED, BAD_REQUEST).

### Exigences librairies / frameworks

- **NextAuth** : version déjà utilisée en 1.2 (compatible T3/Next.js 14+) ; pas de changement de version.
- **bcrypt** : déjà utilisé pour le hash en signup ; utiliser `bcrypt.compare` dans authorize pour le login.
- **Zod** : schéma pour login (email, password) ; peut réutiliser le schéma email de signup si partagé.

### Structure des fichiers (rappel)

- `src/app/(auth)/login/` — page de connexion (non protégée).
- `src/app/(dashboard)/` — routes protégées ; layout ou page avec bouton déconnexion.
- `src/server/api/` — createTRPCContext avec session ; protectedProcedure ; routers existants (auth) et futurs à filtrer par tenantId.

### Tests (optionnel MVP)

- Test unitaire ou intégration sur le flux login (authorize avec identifiants valides/invalides) ; ou test e2e minimal : soumission formulaire login → redirection dashboard. Non bloquant si non exigé par l'epic.

---

## Technical Requirements (Dev Agent Guardrails)

- **Auth** : NextAuth Credentials + JWT uniquement ; pas de session DB côté login (JWT suffit). Authorize : lookup User par email, vérifier password avec bcrypt.compare, retourner { id, email, tenantId, role }.
- **Isolation tenant** : Toute procédure tRPC qui lit/écrit des données métier (tenant, user, commandes, etc.) doit être protégée et utiliser `ctx.session.user.tenantId` dans les clauses `where` / `data` ; ne jamais faire confiance au client pour tenantId.
- **Login page** : Formulaire simple (email, password) ; en cas d'erreur Credentials (identifiants invalides), afficher un message clair sans révéler si l'email existe ou non (sécurité).
- **Déconnexion** : `signOut()` côté client (next-auth/react) ; redirection configurable (optionnel : redirect vers `/` ou `/login`).

---

## Architecture Compliance

- **§10 Security** : Isolation tenant + RBAC ; pas d'API publique ; vérification mot de passe via bcrypt.
- **Implementation Patterns** : Contexte tRPC avec session ; tenantId uniquement depuis session ; naming et structure T3 respectés.
- **§11 Stack** : Vercel (web), NextAuth, Prisma, tRPC ; pas de changement de stack.

---

## Library & Framework Requirements

- NextAuth (existant), bcrypt (existant), Zod (existant). Aucune nouvelle dépendance requise pour le login.
- UI : shadcn/ui + Tailwind (Input, Button, Label, Card) pour la page login, cohérent avec signup.

---

## File Structure Requirements

- Nouveau fichier : `src/app/(auth)/login/page.tsx`.
- Modifications : `src/server/auth.ts` (authorize pour login si pas déjà couvert), `src/server/api/trpc.ts` (ou équivalent : context + protectedProcedure), layout ou page dashboard (bouton déconnexion).
- Ne pas déplacer ni renommer les routes (auth)/signup ou (dashboard)/dashboard sans raison ; garder la structure actuelle.

---

## Testing Requirements

- Optionnel : test sur authorize (credentials valides / invalides) ; ou e2e login → dashboard. Pas de régression sur signup (session créée après inscription).

---

## Previous Story Intelligence

- **Story 1.2** : NextAuth configuré en JWT (pas strategy database) ; callbacks enrichissent `session.user` avec `tenantId` et `role`. Completion note : « tRPC context pourra être étendu en story 1.3 avec session dans createTRPCContext et procédures protégées filtrées par tenantId ». Fichiers créés : auth.ts, auth router, signup page, dashboard page, lib/validations/signup, auth.mutation.test.ts. Type augmentation NextAuth dans `src/types/next-auth.d.ts`. Utiliser les mêmes patterns (Zod partagé si utile, TRPCError, pas de tenantId depuis le body).
- **Review 1.2** : Tests mutation signup + schéma partagé ; AUTH_SECRET requis en prod. Pour 1.3 : réutiliser auth.ts et callbacks ; ajouter uniquement la page login et le filtre tenant dans tRPC.

---

## Project Context Reference

- **Artefacts BMAD** : `_bmad-output/planning-artifacts/` (prd.md, architecture.md, epics.md) ; `_bmad-output/implementation-artifacts/` (sprint-status.yaml, stories 1-1, 1-2, 1-3).
- **Conventions** : document_output_language French ; stack T3 + NextAuth + Prisma.

---

## Senior Developer Review (AI)

- **Review outcome:** Approve (après correctifs)
- **Review date:** 2026-02-04
- **Action items:** 4 High/Medium adressés par correctifs automatiques
  - [x] [HIGH] Open redirect sur login : restreindre `callbackUrl` aux chemins relatifs sûrs
  - [x] [MEDIUM] Validation Zod côté serveur pour login : utiliser `loginInputSchema` dans `authorize`
  - [x] [MEDIUM] Incohérence Status dans la story (ready-for-dev vs review) corrigée
  - [x] [LOW] Log tRPC en prod : limiter au dev uniquement
- Note : Session tRPC en route handler (auth() sans requête) — conforme à la doc NextAuth v5 ; aucune modification. Aucune procédure n’utilise encore `protectedProcedure` (prévu pour les prochaines stories).

## Story Completion Status

- **Status** : done
- **Completion note** : Page login, session dans tRPC, protectedProcedure, bouton Déconnexion. Tests login schema + mise à jour tests signup. Code review : correctifs open redirect, Zod serveur, log dev, statut story.
- **Ultimate context engine analysis completed** — comprehensive developer guide created.

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- **Code review (post-CR correctifs)** : [HIGH] Open redirect corrigé : `callbackUrl` restreint aux chemins relatifs sûrs (`/` sans `//`) sur la page login. [MEDIUM] Validation Zod côté serveur : `authorize` dans auth.ts utilise `loginInputSchema.safeParse` avant findUnique. [LOW] Log tRPC limité au dev (`t._config.isDev`). Incohérence Status (ready-for-dev vs review) corrigée. Note : `protectedProcedure` est en place ; aucune procédure dashboard ne l’utilise encore (prévu pour les stories suivantes).
- Task 1 : Page login `src/app/(auth)/login/page.tsx` avec formulaire email/mot de passe, validation Zod côté client (`~/lib/validations/login`), soumission via `signIn("credentials", ...)` avec `callbackUrl` depuis query params ou `/dashboard`, message d’erreur générique en cas d’échec. `pages.signIn` dans auth.ts mis à jour vers `/login`. Redirection dashboard sans session vers `/login`.
- Task 2 : Provider Credentials inchangé (email/password + bcrypt, tenantId + role en session). `createTRPCContext` reçoit `session` (appel à `auth()` dans route handler et dans `src/trpc/server.ts` pour RSC). `protectedProcedure` ajoutée dans trpc.ts avec middleware `enforceSession` (UNAUTHORIZED si pas de session). Commentaire d’isolation tenant : utiliser uniquement `ctx.session.user.tenantId`, pas de donnée dashboard sans session valide.
- Task 3 : Layout dashboard `src/app/(dashboard)/layout.tsx` avec header et composant client `SignOutButton` appelant `signOut({ callbackUrl: "/login" })`.
- Tests : 5 tests unitaires pour le schéma login et `getLoginValidationErrors` dans `src/lib/validations/login.test.ts`. Tests signup existants mis à jour avec `session: null` dans le contexte tRPC. Tous les tests passent.

### File List

- src/app/(auth)/login/page.tsx (créé ; post-CR : callbackUrl sanitized)
- src/app/(dashboard)/layout.tsx (créé)
- src/app/(dashboard)/_components/sign-out-button.tsx (créé)
- src/lib/validations/login.ts (créé)
- src/lib/validations/login.test.ts (créé)
- src/server/auth.ts (modifié : pages.signIn → /login, authorize avec loginInputSchema)
- src/server/api/trpc.ts (modifié : createTRPCContext + session, protectedProcedure, doc isolation tenant, log uniquement en dev)
- src/app/api/trpc/[trpc]/route.ts (modifié : session injectée via auth())
- src/trpc/server.ts (modifié : session injectée via auth())
- src/app/(dashboard)/dashboard/page.tsx (modifié : redirect sans session → /login)
- src/server/api/routers/auth.mutation.test.ts (modifié : createTRPCContext avec session: null)
- _bmad-output/implementation-artifacts/sprint-status.yaml (modifié : 1-3 → in-progress puis review)
