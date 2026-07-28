# Story 7A.1: Landing de présentation du produit

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **visiteur (non connecté)**,
I want **consulter une landing de présentation du produit SnapSell**,
so that **je découvre la proposition de valeur et je suis orienté vers l'inscription ou la connexion**.

## Acceptance Criteria

1. **Given** un visiteur non connecté  
   **When** il accède à la racine `/`  
   **Then** une page de présentation du produit SnapSell s'affiche (hero, proposition de valeur, fonctionnalités clés, call-to-action)  
   **And** la page contient au moins un lien vers l'inscription (`/login?tab=signup`) et un lien vers la connexion (`/login`)

2. **Given** un visiteur sur la landing  
   **When** il consulte le contenu  
   **Then** la proposition de valeur est claire : « Transformez vos lives en commandes structurées via WhatsApp »  
   **And** les fonctionnalités clés sont présentées (réservation automatique, file d'attente, anti-fantômes, dashboard commandes)  
   **And** le contenu est en français

3. **Given** un visiteur sur la landing  
   **When** il consulte la page sur différents appareils  
   **Then** la page est responsive (desktop, tablette, mobile)  
   **And** les CTA (inscription / connexion) sont visibles et accessibles sur tous les breakpoints

4. **Given** un visiteur sur la landing  
   **When** il utilise un lecteur d'écran ou la navigation clavier  
   **Then** la page respecte les principes d'accessibilité WCAG 2.1 AA (contrastes, labels, structure sémantique, focus visible)

5. **Given** un utilisateur déjà connecté  
   **When** il accède à `/`  
   **Then** il est redirigé vers `/dashboard` (optionnel MVP — acceptable si la landing s'affiche quand même)

## Tasks / Subtasks

- [x] Task 1 : Remplacer la page d'accueil boilerplate (AC: #1, #2)
  - [x] Supprimer le contenu T3 par défaut dans `src/app/page.tsx`
  - [x] Créer la structure de la landing page avec les sections : Header (navigation + CTA), Hero (titre + sous-titre + CTA principal), Fonctionnalités (3–4 blocs), Comment ça marche (étapes), Call-to-action final, Footer
  - [x] Rédiger le contenu en français aligné avec le PRD et l'UX spec (proposition de valeur, différenciateurs : codes + grille prix, réservation atomique + file + TTL, acompte anti-fantômes, dashboard prêt à livrer)

- [x] Task 2 : Réutiliser les composants existants (AC: #1, #3)
  - [x] Réutiliser `SnapSellLogo` depuis `src/components/auth/snapsel-logo.tsx`
  - [x] Réutiliser `Button` de shadcn/ui pour les CTA
  - [x] Utiliser les tokens de couleur existants (primary, muted, card, etc.) et le font Manrope
  - [x] Navigation header : composant `SiteHeader` pour la landing (logo + liens + CTA + menu mobile Sheet), `AuthHeader` dédié pour les pages auth

- [x] Task 3 : Responsive et accessibilité (AC: #3, #4)
  - [x] Desktop-first avec adaptations mobile/tablette (breakpoints 768px, 1024px)
  - [x] Structure HTML sémantique (`<header>`, `<main>`, `<section>`, `<footer>`)
  - [x] Contraste WCAG AA sur texte et boutons ; focus visible sur liens et CTA
  - [x] Alt text sur toute image/icône décorative marquée `aria-hidden`
  - [x] Skip-to-content link (WCAG 2.4.1)
  - [x] Menu hamburger mobile via Sheet (nav accessible sur tous breakpoints)

- [ ] Task 4 : Redirection utilisateur connecté (AC: #5, optionnel)
  - [ ] Vérifier si un middleware ou une logique serveur redirige `/` vers `/dashboard` quand l'utilisateur est authentifié
  - [ ] Si implémenté : `redirect("/dashboard")` côté serveur dans `page.tsx` si session active

## Dev Notes

- **Source principale :** FR35 — « Un visiteur peut consulter une landing de présentation du produit. » [Source: _bmad-output/planning-artifacts/epics.md, Story 7A.1]
- **UX Spec :** La landing est mentionnée dans le design system (web = console business & ops + landing marketing) et la platform strategy. Pas de maquette détaillée — se baser sur la proposition de valeur du PRD, les principes UX (clarté, feedback immédiat, familiarité) et le design system existant (shadcn/ui + Tailwind).
- **PRD (Executive Summary) :** SnapSell = solution WhatsApp-first, checkout unique sur WhatsApp, différenciateurs = codes physiques + grille catégories→prix, réservation atomique + file + TTL + acompte, modèle hybride stock préparé + flux improvisé.
- **Contenu landing recommandé :**
  - Hero : « Transformez vos lives en commandes structurées — checkout unique sur WhatsApp »
  - Sous-titre : « Plus de chaos en DM. Codes, réservations, file d'attente et acompte — tout est automatisé. »
  - Fonctionnalités clés (3–4 blocs) : (1) Codes + grille prix : pas de saisie en live, prix automatique par catégorie ; (2) Réservation atomique + file d'attente : plus de disputes « premier arrivé » ; (3) Anti-fantômes : TTL + acompte recommandé + rappels automatiques ; (4) Dashboard prêt à livrer : liste de commandes propre après le live
  - Comment ça marche (3 étapes) : (1) Configurez votre grille et connectez WhatsApp ; (2) Annoncez vos codes en live, les clientes envoient le code ; (3) Consultez vos commandes prêtes à livrer dans le dashboard
  - CTA final : « Créez votre compte vendeur — gratuit pour commencer »
- **Ce story NE couvre PAS :** l'abonnement / entitlements (Story 7A.2), les pages Tarifs, Ressources (liens `#` pour le moment).

### Project Structure Notes

- **Fichier principal à modifier :** `src/app/page.tsx` — remplacer le boilerplate T3 par la landing SnapSell
- **Composants réutilisables :** `SnapSellLogo` (logo SVG), `Button` (shadcn), `Card` (shadcn, optionnel pour feature blocks)
- **NE PAS modifier :** `AuthHeader` / `AuthFooter` / `AuthValuePanel` — ces composants sont dédiés au layout auth (`(auth)/layout.tsx`). La landing a son propre header/footer inline ou dans des composants dédiés landing.
- **Layout :** La page `/` utilise le `RootLayout` (`src/app/layout.tsx`) directement — pas de layout intermédiaire. Le fond, le thème dark et la font Manrope sont déjà appliqués.
- **Optionnel :** Si la page devient volumineuse, extraire les sections dans `src/app/_components/landing/` (ex. `hero-section.tsx`, `features-section.tsx`, etc.)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 7A, Story 7A.1]
- [Source: _bmad-output/planning-artifacts/prd.md — Executive Summary, Product Scope MVP, User Journeys]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Core User Experience, Platform Strategy, Design System Foundation, Visual Design Foundation]
- [Source: _bmad-output/planning-artifacts/architecture.md — §11 Deployment (Vercel web), §Project Structure (src/app/page.tsx)]
- [Source: src/components/auth/snapsel-logo.tsx — SnapSellLogo component]
- [Source: src/components/auth/auth-header.tsx — Navigation pattern (logo + links + CTA button)]
- [Source: src/styles/globals.css — Color tokens, dark mode, auth-page-bg gradient]

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **Objectif :** Remplacer le boilerplate T3 (`Create T3 App`) par une vraie landing de présentation de SnapSell orientée conversion (visiteur → inscription).
- **Cible :** Visiteurs non connectés : vendeurs live-first, vendeurs stock préparé, managers. Cibles Afrique francophone principalement.
- **Proposition de valeur à communiquer :** SnapSell transforme n'importe quel live (TikTok, IG, Snap) en commandes structurées via WhatsApp — checkout unique, codes + grille prix, réservation atomique, anti-fantômes (TTL + acompte), dashboard prêt à livrer.
- **Langue :** Français (comme le reste du projet).
- **Ton :** Professionnel mais accessible, direct, orienté bénéfices (pas de jargon technique). Aligné avec les principes UX : clarté, feedback, familiarité.

### Technical Requirements

- **Framework :** Next.js App Router (server component par défaut, `page.tsx` peut être RSC — pas besoin de `"use client"` sauf interactions JS)
- **Styling :** Tailwind CSS avec les tokens du design system existant (voir `globals.css`). Utiliser les couleurs sémantiques : `primary`, `muted`, `card`, `foreground`, `muted-foreground`, `border`, etc.
- **Composants :** shadcn/ui `Button` pour les CTA. `Card` optionnel pour les blocs fonctionnalités. `SnapSellLogo` pour le logo.
- **Font :** Manrope (déjà configurée dans `RootLayout` via `--font-manrope`).
- **Mode :** Le projet est en dark mode par défaut (`html className="dark"`). La landing doit fonctionner en dark mode.
- **Performance :** Page statique (pas de données dynamiques) — aucun appel tRPC nécessaire. Supprimer l'appel `api.example.hello` existant. La page peut être un RSC pur (server component).
- **SEO :** Ajouter des `metadata` Next.js appropriées (title, description) pour la landing. Le `metadata` actuel dans `layout.tsx` est générique — la page peut exporter son propre `metadata`.
- **Images :** Utiliser des icônes Lucide (déjà dans le projet : `lucide-react`) pour les feature blocks. Pas de photo externe requise (pas de dépendance à une URL externe comme le `AuthValuePanel` le fait — préférer des icônes/illustrations inline).

### Architecture Compliance

- **Stack :** Next.js App Router, Tailwind, shadcn/ui — aucune nouvelle dépendance.
- **Naming :** Fichiers pages en `page.tsx` ; composants en PascalCase si extraits.
- **Structure :** `src/app/page.tsx` est le point d'entrée. Si extraction, utiliser `src/app/_components/landing/` (convention Next.js : `_` prefix = pas une route).
- **Pas de backend :** La landing n'a besoin d'aucune procédure tRPC, d'aucun accès Prisma, d'aucune donnée dynamique.

### Library / Framework Requirements

| Lib | Version | Usage dans cette story |
|-----|---------|----------------------|
| next | existante | App Router, `page.tsx`, `metadata`, `Link` |
| tailwindcss | existante | Styling, tokens couleur, responsive |
| shadcn/ui | existante | `Button`, optionnel `Card` |
| lucide-react | existante | Icônes pour features (MessageCircle, ShieldCheck, Clock, BarChart3, etc.) |

**Aucune nouvelle dépendance à installer.**

### File Structure Requirements

```
src/app/
  page.tsx                              ← MODIFIER : remplacer boilerplate par landing
  (optionnel) _components/landing/
    hero-section.tsx                     ← Si extraction
    features-section.tsx
    how-it-works-section.tsx
    cta-section.tsx
    landing-header.tsx
    landing-footer.tsx
```

**Fichiers à NE PAS modifier :**
- `src/app/layout.tsx` — le RootLayout est correct (dark mode, fonts, providers)
- `src/app/(auth)/*` — les pages auth sont autonomes
- `src/app/(dashboard)/*` — le dashboard est autonome
- `src/components/auth/*` — composants auth dédiés au layout auth

### Testing Requirements

- **Visuel :** Vérifier le rendu sur desktop (1280px+), tablette (768px), mobile (375px) — landing lisible, CTA visibles, responsive.
- **Liens :** Les CTA « Créer un compte » / « Se connecter » pointent vers `/login?tab=signup` et `/login`.
- **Accessibilité :** Structure sémantique (`h1`, `h2`, sections), contraste texte/fond WCAG AA, focus visible sur les liens et boutons.
- **Pas de régression :** Les routes existantes (`/login`, `/dashboard/*`, `/api/*`) ne sont pas impactées.
- **Pas de test unitaire requis :** Page statique sans logique métier. Un test d'intégration (le render ne crashe pas) est suffisant si le projet a un setup test pour les composants React.

---

## Previous Story Intelligence

- **Story 6.6 (Tableau de bord)** : Dernier story complété. Patterns shadcn/ui (Card, Badge, Button), layout dashboard avec sidebar, tRPC `dashboard.getSummary`. Pour 7A.1 : réutiliser les tokens de couleur et les composants shadcn, mais pas de logique tRPC/Prisma (landing = page statique).
- **Auth pages (login/signup)** : Layout split (formulaire à gauche, `AuthValuePanel` à droite). Navigation `AuthHeader` avec logo + liens + bouton Connexion. Pour 7A.1 : s'inspirer du pattern navigation (logo + liens + CTA) mais créer un header landing dédié (la landing a son propre layout, pas celui d'auth).
- **Design system en place** : Dark mode, couleur primary purple (#a855f7), font Manrope, composants shadcn (Button, Card, Badge, Input, Label). Gradient auth-page-bg (purple → blue) disponible comme inspiration pour le hero.
- **Git récent** : Fix TypeScript strict, Vercel build. Le projet compile et build correctement. Aucun breaking change récent.

---

## Git Intelligence Summary

- **Derniers commits :** Fix TypeScript strict errors pour Vercel build, code review fixes story 6.6, dashboard home + sidebar.
- **Patterns observés :**
  - Fichiers page en RSC quand pas d'interaction client ; `"use client"` seulement quand nécessaire (hooks, événements)
  - shadcn/ui composants dans `src/components/ui/`
  - Composants feature dans `src/app/(dashboard)/_components/` ou `src/components/auth/`
  - Lucide icons pour les icônes (MessageCircle, Rocket, CreditCard, CheckCircle2, etc.)
  - Tailwind classes directement dans JSX (pas de CSS modules)
- **Build :** Le projet build correctement sur Vercel (`npm run build` passe).

---

## Latest Tech Information

- **Next.js App Router** : Le projet utilise Next.js avec App Router. Pour une landing statique, un RSC (React Server Component) suffit — pas de `"use client"`. Export `metadata` pour SEO.
- **Tailwind CSS v4** : Le projet utilise la syntaxe Tailwind v4 (`@import "tailwindcss"`, `@theme`, `@custom-variant`). Utiliser les classes Tailwind standard.
- **shadcn/ui** : Composants déjà installés (Button, Card, etc.). Pas de mise à jour nécessaire.
- **Lucide React** : Icônes vectorielles. Utiliser `<IconName className="size-X" />`.

---

## Project Context Reference

- **Config :** Aucune config spécifique pour la landing. La landing est une page publique, pas de tenant ni d'auth requise.
- **Conventions :** TypeScript strict, ESLint + Prettier, dark mode par défaut, français comme langue d'interface, Manrope comme font principale.
- **Déploiement :** Vercel — la landing sera servie par Vercel (même déploiement que le dashboard). Page statique = rendu optimisé automatiquement par Next.js (Static Rendering).

---

## Dev Agent Record

### Agent Model Used

Claude claude-4.6-opus (Cursor)

### Debug Log References

### Completion Notes List

- Tasks 1–3 implémentées. Task 4 (redirect user connecté) laissée `[ ]` car marquée optionnel MVP.
- Code review adversariale #1 effectuée : 4 HIGH, 5 MEDIUM, 1 LOW identifiés et tous corrigés.
- H1 : ajout « via WhatsApp » au H1 hero (AC#2 conformité).
- H2 : ajout menu hamburger mobile via Sheet (AC#4 accessibilité mobile).
- H3 : ajout skip-to-content link (WCAG 2.4.1).
- H4 : remplacement couleur hardcodée `text-[#7c3aed]` → `text-[var(--primary)]` dans CTA.
- M1 : documentation story mise à jour (tasks, file list, status).
- M3 : trailing newline ajoutée à globals.css.
- M4 : metadata OpenGraph + Twitter ajoutées pour SEO social.
- M5 : social proof fictif « +2 000 vendeurs » remplacé par « Inscription en 2 min — gratuit ».
- L1 : `SiteHeader` partagé créé, `LandingHeader` et `AuthHeader` refactorisés en re-exports.
- Modification `auth-header.tsx` : harmonisation header demandée par Fabrice (hors périmètre story original, tracké ici).

**Code review adversariale #2 (2026-02-09) — 3 HIGH, 4 MEDIUM, 3 LOW — tous corrigés :**

- CR2-H1 : `AuthHeader` restauré comme composant dédié (serveur component, sans Sheet/hamburger, CTA unique « Connexion »). Le re-export de SiteHeader cassait l'UX auth (double CTA, skip-to-content vers `#main-content` inexistant, bundle Sheet inutile).
- CR2-H2 : Social proof mensonger « Rejoignez des milliers d'entrepreneurs » remplacé par CTA factuel dans `cta-section.tsx`.
- CR2-H3 : `SnapSellLogo` (SVG→Image) et fichiers hors périmètre (`layout.tsx`, `app-sidebar.tsx`, `public/logo.png`) documentés dans File List.
- CR2-M1/M2 : File List complétée avec les 4 fichiers modifiés non documentés.
- CR2-M3 : « Voir la démo » → « Découvrir les fonctionnalités » (label honnête, pas de démo disponible).
- CR2-M4 : Dimensions Image `SnapSellLogo` réduites de 500×500 → 80×80 (performance, cible Afrique francophone).
- CR2-L1 : Hiérarchie titres corrigée `<h4>` → `<h3>` dans `how-it-works-section.tsx` (WCAG heading levels).
- CR2-L2 : `og:image` + `metadataBase` ajoutés dans metadata `page.tsx` pour previews social.
- CR2-L3 : « Parler à un expert » (lien mort hors périmètre) remplacé par « Se connecter » (`/login`).

### File List

- `src/app/page.tsx` — Page principale landing, compose les sections, metadata SEO + OpenGraph + metadataBase
- `src/app/_components/landing/hero-section.tsx` — Section hero (H1, CTA, dashboard mock)
- `src/app/_components/landing/features-section.tsx` — 4 feature cards (Codes, Réservation, TTL, Dashboard)
- `src/app/_components/landing/how-it-works-section.tsx` — 3 étapes + mock chat WhatsApp
- `src/app/_components/landing/cta-section.tsx` — CTA final fond primary
- `src/app/_components/landing/landing-header.tsx` — Re-export de SiteHeader
- `src/app/_components/landing/landing-footer.tsx` — Footer 4 colonnes
- `src/components/site-header.tsx` — Header landing (nav + mobile Sheet + skip link)
- `src/components/auth/auth-header.tsx` — Header auth dédié (nav + CTA Connexion, server component)
- `src/components/auth/snapsel-logo.tsx` — Logo SnapSell (Image next/image, remplace ancien SVG inline)
- `src/app/(dashboard)/_components/app-sidebar.tsx` — Utilisation du nouveau SnapSellLogo + branding
- `src/app/layout.tsx` — Favicon mis à jour (favicon.ico → logo.png + apple-touch-icon)
- `public/logo.png` — Asset logo SnapSell (nouveau fichier)
- `src/styles/globals.css` — Ajout classe `.hero-glow`
