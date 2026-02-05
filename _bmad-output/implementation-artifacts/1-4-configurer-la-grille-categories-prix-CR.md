# Code Review — Story 1.4 : Configurer la grille catégories→prix

**Date** : 2025-02-04  
**Story** : 1.4 — Grille catégories→prix  
**Statut global** : **Conforme** avec remarques mineures

---

## 1. Critères d’acceptation

| AC | Statut | Commentaire |
|----|--------|-------------|
| Connecté au dashboard → accès config → saisie montants par catégorie → grille enregistrée pour le tenant, utilisée pour le calcul (FR11) | OK | Page Paramètres, formulaire grille, API get/set, tenantId uniquement depuis session. |
| FR2 couvert | OK | Grille configurable par vendeur/manager. |

---

## 2. Revue par tâche

### Task 1 : Modèle de données grille catégories→prix

| Point | Statut |
|-------|--------|
| Schéma Prisma `CategoryPrice` (tenant_id, category_letter, amount_cents, description) | OK |
| snake_case + `@map` | OK (`@@map("category_prices")`, champs mappés) |
| Contrainte unicité `(tenant_id, category_letter)` | OK |
| Migration dédiée | OK (`20260204180000_add_category_prices`) |
| Relation Tenant → CategoryPrice | OK |

**Verdict** : Conforme.

---

### Task 2 : API tRPC pour la grille

| Point | Statut |
|-------|--------|
| `protectedProcedure` pour getCategoryPrices et setCategoryPrices | OK |
| tenantId uniquement depuis `ctx.session.user.tenantId` | OK (aucun tenantId côté client) |
| Validation Zod (catégorie, montant positif) | OK (`settings.schema.ts`) |
| TRPCError (FORBIDDEN, BAD_REQUEST) | OK (rôles, tenantId manquant) |
| RBAC : seuls Owner/Manager peuvent modifier | OK (`canManageGrid`, FORBIDDEN pour les autres) |

**Détails :**
- `getCategoryPrices` : lecture pour tout utilisateur connecté. La story demande un accès à la grille « réservé aux rôles autorisés » ; on peut envisager de restreindre aussi la lecture aux Owner/Manager (actuellement un Agent peut lire la grille mais ne peut pas enregistrer).
- Catégorie : story « lettre A–Z ou plage définie », implémentation « code libre » 1–50 caractères (ex. A, AB, Premium). Aligné avec les dev notes (« code libre ») ; écart mineur par rapport au libellé tâche.

**Verdict** : Conforme.

---

### Task 3 : Page Paramètres / Grille

| Point | Statut |
|-------|--------|
| Route `parametres/` avec section Grille | OK |
| Formulaire : montants par catégorie, chargement tRPC, enregistrement mutation | OK |
| UI shadcn + Tailwind (Input, Button, Label, Card, Table, Dialog, AlertDialog) | OK |
| Page protégée (session requise) | OK (redirect `/login` si pas de session) |

**Verdict** : Conforme.

---

### Task 4 : Navigation dashboard

| Point | Statut |
|-------|--------|
| Lien « Paramètres » / « Grille de prix » vers la grille | OK (sidebar « Grille de prix » → `/parametres`) |
| Accès réservé Owner/Manager | Partiel : lien visible pour tous les rôles ; l’API rejette l’écriture pour les non-Owner/Manager (FORBIDDEN). Pas de masquage du lien pour Agent. |

**Recommandation** (optionnel) : pour coller à « accès réservé aux rôles autorisés », masquer l’entrée « Grille de prix » (ou tout le groupe Paramètres) pour les rôles qui n’ont pas le droit (ex. Agent), en s’appuyant sur `session.user.role` dans le layout/sidebar.

**Verdict** : Conforme au sens « lien présent + écriture protégée » ; amélioration possible côté UX/navigation.

---

## 3. Conformité architecture & sécurité

| Exigence | Statut |
|----------|--------|
| Isolation tenant (tenantId uniquement depuis session) | OK |
| Pas d’API publique (procédures protégées) | OK |
| RBAC Owner/Manager pour modification grille | OK |
| DB snake_case, Prisma @map | OK |
| Montants en entiers (centimes) | OK |
| Session tRPC (auth avec headers dans route handler) | OK (correction appliquée) |

---

## 4. Fichiers créés / modifiés

- **Prisma** : modèle `CategoryPrice`, migration `add_category_prices` — OK  
- **API** : `settings.ts`, `settings.schema.ts`, enregistrement dans `root.ts` — OK  
- **Page** : `parametres/page.tsx`, `_components/pricing-grid-content.tsx` — OK  
- **Navigation** : `app-sidebar.tsx` (lien Grille de prix) — OK  
- **tRPC** : route handler avec `auth({ headers: req.headers }, …)` et client avec `credentials: "include"` — OK  

---

## 5. Améliorations (traitées)

1. **Navigation RBAC** : ✅ « Grille de prix » est cachée pour les rôles autres qu’Owner/Manager (`canManageGrid` passé au sidebar, `requiresGridRole` sur l’item). Accès direct à `/parametres` redirige vers `/dashboard` si l’utilisateur n’a pas le droit.
2. **Lecture grille** : ✅ `getCategoryPrices` restreint aux rôles Owner/Manager (FORBIDDEN sinon).
3. **Zod catégorie** : ✅ Commentaire ajouté dans `settings.schema.ts` (code libre 1–50 caractères ; indication pour une éventuelle regex A–Z).

---

## 6. Synthèse

- **Story 1.4** : implémentation **conforme** aux critères d’acceptation et à l’architecture (données, API, page, navigation, sécurité).
- **Points forts** : isolation tenant stricte, RBAC sur l’écriture, gestion liste vide (suppression complète), affichage des erreurs de mutation, session tRPC corrigée.
- **Optionnel** : renforcer RBAC en masquant le lien Paramètres pour les rôles non autorisés et, si besoin, en restreignant la lecture de la grille aux Owner/Manager.

**Statut recommandé** : **Accepté** (avec suivi optionnel des améliorations ci‑dessus).
