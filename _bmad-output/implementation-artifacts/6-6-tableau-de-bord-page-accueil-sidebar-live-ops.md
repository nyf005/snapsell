# Story 6.6: Tableau de bord — page d'accueil (bienvenue + À traiter + Activité) + sidebar Live Ops en lien unique

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **vendeur, agent ou manager**,
I want **une page d'accueil du tableau de bord avec bienvenue, ce qui demande mon attention (À traiter) et un aperçu de l'activité (Contexte), et une navigation Live Ops en lien unique**,
so that **je sais où j'en suis et ce qui mérite mon attention sans avoir une page qui se comporte comme un menu**.

## Acceptance Criteria

1. **Given** je suis connecté au dashboard  
   **When** j'arrive sur la page Tableau de bord (après login ou en cliquant « Tableau de bord »)  
   **Then** je vois un message de bienvenue personnalisé (« Bienvenue, [nom ou email] ») et optionnellement le nom du tenant  
   **And** la page ne se comporte pas comme un simple menu (pas une liste de tous les liens de la sidebar)

2. **Given** je suis sur la page Tableau de bord  
   **When** je consulte le bloc « À traiter »  
   **Then** je vois des signaux utiles : nombre de preuves en attente (avec lien vers Preuves), indicateur sur les commandes (ex. à préparer / en attente d'acompte) avec lien vers Commandes, et état de la session live (en cours ou non) avec lien vers Live Ops  
   **And** chaque élément est cliquable pour aller vers la page concernée

3. **Given** je suis sur la page Tableau de bord  
   **When** je consulte le bloc « Activité » ou « Contexte »  
   **Then** je vois un aperçu de l'activité (ex. commandes aujourd'hui, cette semaine, et/ou en préparation / en livraison)  
   **And** optionnellement une indication sur la dernière session live

4. **Given** je consulte la sidebar du dashboard  
   **When** je regarde l'entrée Live Ops  
   **Then** Live Ops est un lien unique vers `/dashboard/live` (plus de dropdown « Session live » / « Réservations »)  
   **And** la page Réservations peut rester un alias/redirect vers Live Ops si elle existe

5. **Given** je me connecte avec succès  
   **Then** je suis redirigé vers `/dashboard` (tableau de bord) pour voir en premier la bienvenue et le résumé  
   **And** le comportement de redirection après login reste cohérent (déjà vers `/dashboard` aujourd'hui ; à confirmer/maintenir)

## Tasks / Subtasks

- [x] Task 1 : Données tableau de bord (AC: #2, #3)
  - [x] Exposer les données nécessaires : tRPC `dashboard.getSummary` agrège counts/états. Données : (1) count preuves en attente ; (2) counts commandes (preparing, today, yesterday, revenue) ; (3) session live courante via `getCurrentSessionReadOnly`. Isolation tenant stricte (tenantId depuis session).
  - [x] Router dédié `dashboard` avec schéma Zod (`dashboard.schema.ts`), enregistré dans `root.ts`. Helpers de dates exportés et testables (paramètre `now`).

- [x] Task 2 : Page Tableau de bord — structure et blocs (AC: #1, #2, #3)
  - [x] `src/app/(dashboard)/dashboard/page.tsx` : header « Bienvenue, [user] » avec nom du tenant. Suppression de l'affichage technique tenantId.
  - [x] Bloc « À traiter » : 3 cartes (Preuves en attente → lien Preuves ; Commandes à préparer → lien Commandes ; Session live → lien Live Ops). Composants shadcn (Card, Badge, Button). Données via `dashboard.getSummary`.
  - [x] Bloc « Activité » : KPI ventes totales + revenu estimé (vs hier), bar chart revenus 7 jours (recharts + shadcn chart), flux d'activité (timeline). Liens vers Commandes.
  - [x] Accessibilité : titres h2 avec aria-labelledby, structure sémantique sections. Polling 60s (refetchInterval).

- [x] Task 3 : Sidebar — Live Ops en lien unique (AC: #4)
  - [x] `app-sidebar.tsx` : groupe Live Ops = un seul item `{ href: "/dashboard/live", label: "Live Ops", icon: Radio }`. Rendu comme lien simple (pas de dropdown/chevron) via la logique `visibleItems.length === 1`.
  - [x] `dashboard/reservations/page.tsx` : redirect Next.js vers `/dashboard/live`.

- [x] Task 4 : Redirection après login (AC: #5)
  - [x] Vérifié : `login/page.tsx` utilise `callbackUrl` par défaut `/dashboard`. Le tableau de bord est la page d'accueil post-login.

- [x] Task 5 : Tests (AC: #1 à #5)
  - [x] `dashboard.test.ts` : 16 tests — getSummary counts corrects, revenue avec amountCents null, hasLiveSession true/false, isolation tenant (tenant-1 vs tenant-2), BAD_REQUEST si tenantId vide. Helpers de dates : getTodayUtcRange, getYesterdayUtcRange, getLast7DaysRanges (boundary midnight, changement de mois, structure 7 jours).
  - [x] Page : blocs Bienvenue, À traiter, Activité avec données tRPC. Liens fonctionnels (Preuves, Commandes, Live Ops).
  - [x] Sidebar : Live Ops = lien unique vers /dashboard/live ; pas de sous-menu.

## Dev Notes

- **Source :** Décisions Party Mode (rétrospective / discussion tableau de bord) ; Epic 6 — Dashboard commandes et Live Ops (FR29–FR34, FR45). Cette story complète l'Epic 6 en ajoutant une vraie page d'accueil du tableau de bord (au lieu d'une page minimale ou d'un menu) et en simplifiant la navigation Live Ops.
- **Contexte :** La page `dashboard/page.tsx` existe et affiche déjà « Bienvenue, [name] » et un libellé technique tenantId. Les routers `orders`, `proofs`, `live` existent avec `list`, `listPending`, `getCurrentSession`. La sidebar utilise des `menuGroups` avec items et sous-items ; le groupe « Live Ops » a actuellement deux items (Session live, Réservations). Après cette story, la page tableau de bord doit contenir trois blocs : Bienvenue, À traiter, Activité/Contexte — sans être une simple liste de liens.
- **Références :** [Source: _bmad-output/implementation-artifacts/6-1-*.md] (orders.list, filtres), [Source: _bmad-output/implementation-artifacts/6-4-*.md] (live.getCurrentSession), [Source: _bmad-output/implementation-artifacts/6-5-*.md] (patterns UI, design system). [Source: _bmad-output/planning-artifacts/ux-design-specification.md] — navigation Commandes, Live Ops, Proofs, Paramètres.

### Project Structure Notes

- **Fichiers à créer / modifier :**
  - `src/app/(dashboard)/dashboard/page.tsx` : contenu complet (Bienvenue + À traiter + Activité). Optionnel : `_components/dashboard-content.tsx` ou `dashboard-summary.tsx` pour la logique client (tRPC, état) si la page devient lourde.
  - `src/app/(dashboard)/_components/app-sidebar.tsx` : groupe Live Ops en lien unique (un item, href `/dashboard/live`), plus de sous-items.
  - Optionnel : `src/server/api/routers/dashboard.ts` + `dashboard.schema.ts` si procédure `getSummary` ; enregistrer dans `root.ts`.
  - Optionnel : `src/app/(dashboard)/dashboard/reservations/page.tsx` : redirect vers `/dashboard/live` si on souhaite un seul point d'entrée Live Ops.
- **Références :** [Source: _bmad-output/planning-artifacts/prd.md] — Dashboard (liste commandes, Live Ops minimal, Proofs) ; NFR-P4 (polling 30–60 s acceptable).

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **Objectif :** Une page d'accueil du tableau de bord qui donne « Bienvenue » + « ce qui demande mon attention » (À traiter) + « où en est l'activité » (Contexte). Pas une page qui se comporte comme un menu (répétition de tous les liens de la sidebar).
- **À traiter :** Preuves en attente (count + lien Preuves), commandes à traiter (count(s) + lien Commandes), session live en cours ou non (lien Live Ops).
- **Activité / Contexte :** Aperçu léger : ex. commandes aujourd'hui, cette semaine, et/ou en préparation / en livraison ; optionnel dernière session live.
- **Live Ops :** Une seule page (`/dashboard/live`) ; la sidebar doit refléter cela (un lien « Live Ops », pas un dropdown).

### Technical Requirements

- **Données :** Réutiliser `proofs.listPending` (ou count), `orders.list` (avec dateFrom/dateTo, status pour counts), `live.getCurrentSession`. Timezone : préférer UTC en base ; « aujourd'hui » / « cette semaine » selon timezone tenant ou navigateur selon convention projet.
- **Isolation tenant :** Toutes les requêtes filtrées par `tenantId` (session). Aucune donnée cross-tenant.
- **UI :** Composants shadcn (Card, Badge, Link, Button), design system existant (couleurs, espacements comme orders, proofs, live). Pas de nouveau design system.

### Architecture Compliance

- **Stack :** Next.js App Router, tRPC, Prisma. Pas de nouvelle dépendance. Si nouveau router `dashboard`, même pattern que `orders`, `proofs`, `live` (router + schema Zod, enregistrement root).
- **Naming :** Fichiers et routes existants ; pas de changement de routes (rester `/dashboard`, `/dashboard/live`, etc.).

### Library / Framework Requirements

- tRPC, React, shadcn/ui déjà utilisés. Pas de lib supplémentaire pour les counts (requêtes Prisma existantes).

### File Structure Requirements

- Page : `src/app/(dashboard)/dashboard/page.tsx` (et optionnel `_components/` pour extraire le contenu client). Sidebar : `src/app/(dashboard)/_components/app-sidebar.tsx`. Optionnel : router `src/server/api/routers/dashboard.ts`. Tests : si procédure getSummary, `dashboard.test.ts` ; sinon tests d'intégration ou manuels pour la page.

### Testing Requirements

- **Résumé / données :** Counts corrects pour le tenant ; isolation (tenant B ne voit pas les données de A). Session live : null vs session active reflété correctement.
- **Page :** Affichage des trois blocs ; liens fonctionnels (Preuves, Commandes, Live Ops). Pas de régression sur la sidebar (Paramètres, Commandes avec sous-items conservés).
- **Sidebar :** Live Ops = un seul lien, plus de dropdown.

---

## Previous Story Intelligence

- **Story 6.5 (Export CSV, Audit trail) :** Router eventLog, orders.exportCsv avec plafond 10k, feedback erreur export. Patterns : buildXxxWhere partagé, aria-label sur tables. Pour 6.6 : réutiliser orders.list (filtres), proofs, live sans modifier leurs API ; optionnellement un seul endpoint getSummary pour limiter les appels.
- **Story 6.4 (Live Ops) :** live.getCurrentSession, getSessionItems, getSessionReservations, releaseReservation. Page `/dashboard/live` avec contenu complet. Pour 6.6 : le tableau de bord appelle getCurrentSession pour afficher « Session en cours » ou « Aucune session » ; sidebar simplifiée vers un seul lien Live Ops.
- **Story 6.1 (Liste commandes) :** orders.list avec status, dateFrom, dateTo. Pour 6.6 : réutiliser pour counts (ex. list avec limit 0 et count, ou count distinct selon API Prisma).
- **Sidebar :** menuGroups avec Principal (Tableau de bord), Commandes (dropdown), Live Ops (dropdown), Paramètres (dropdown). Pour 6.6 : transformer Live Ops en un seul item comme Principal.

---

## Project Context Reference

- **Config :** Aucune config spécifique pour le tableau de bord. Redirection login : callbackUrl `/dashboard` dans login/page.tsx.
- **Conventions :** TypeScript strict, Prisma, tRPC, shadcn/ui ; design system aligné avec orders, proofs, live.

---

## Dev Agent Record

### Agent Model Used

Claude claude-4.6-opus (Code Review + fixes)

### Debug Log References

- Tests passaient avant review : 322 passed / 0 failed
- Tests après review + fixes : 338 passed / 0 failed (+16 dashboard tests)

### Completion Notes List

- **C1 fix** : Créé `dashboard.test.ts` (16 tests) — counts, revenue, amountCents null, live session, isolation tenant, BAD_REQUEST, + helpers de dates unitaires
- **H1 fix** : Helpers `getTodayUtcRange`, `getYesterdayUtcRange`, `getLast7DaysRanges` exportés avec paramètre `now: Date` pour testabilité déterministe. `getThisWeekUtcRange` supprimé (inutilisé après H2)
- **H2 fix** : Supprimé `ordersInDeliveryCount`, `ordersThisWeekCount`, `liveSessionLastActivityAt` du schéma Zod et du router (requêtes DB + payload inutiles)
- **M1 fix** : Remplacé texte uppercase hardcodé ("VOIR LES PREUVES", "VOIR LES COMMANDES") par casse normale. Supprimé `uppercase tracking-widest` CSS
- **M2 fix** : Ajouté guard `if (diffMs < 0)` dans `formatRelativeTime` pour dates futures
- **M3 fix** : Inline de la logique `isGroupActive` dans le `useEffect` de `app-sidebar.tsx` pour satisfaire exhaustive-deps

### File List

- `src/server/api/routers/dashboard.ts` — Router getSummary : helpers dates exportés (now param), suppression queries inutilisées
- `src/server/api/routers/dashboard.schema.ts` — Schéma Zod : suppression champs inutilisés
- `src/server/api/routers/dashboard.test.ts` — **NOUVEAU** : 16 tests (helpers dates + router getSummary)
- `src/app/(dashboard)/dashboard/_components/dashboard-content.tsx` — Fix uppercase texte, formatRelativeTime edge case, suppression CSS uppercase
- `src/app/(dashboard)/_components/app-sidebar.tsx` — Fix useEffect deps (inline isGroupActive)
- `src/app/(dashboard)/dashboard/page.tsx` — Inchangé (review OK)
- `src/app/(dashboard)/dashboard/reservations/page.tsx` — Inchangé (redirect OK)
- `src/server/api/root.ts` — Inchangé (dashboard router déjà enregistré)
- `src/components/ui/kpi-card.tsx` — Inchangé (review OK)
- `src/app/(auth)/login/page.tsx` — Inchangé (callbackUrl /dashboard confirmé)
