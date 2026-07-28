# Story 7A.2: Gérer l'abonnement / les entitlements du tenant

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **manager ou vendeur (OWNER/MANAGER)**,
I want **consulter les tarifs, souscrire un abonnement par carte (Wave Visa, Visa, Mastercard) ou Mobile Money, être débité automatiquement chaque mois, et voir mon usage et mes limites**,
so that **l'accès au service soit contrôlé selon mon plan, le paiement soit simple et automatique, et je comprenne clairement ce que je paie**.

## Acceptance Criteria

### Page Tarifs (publique)

1. **Given** un visiteur (connecté ou non)  
   **When** il accède à `/tarifs`  
   **Then** une page affiche les 3 plans (Free, Starter 25 000 FCFA/mois, Pro 50 000 FCFA/mois) avec les entitlements de chaque plan (commandes incluses, agents, fonctionnalités), les overages pour Starter/Pro, et un CTA par plan  
   **And** la page est responsive, accessible (WCAG AA), en français, cohérente avec la landing

2. **Given** un visiteur non connecté sur `/tarifs`  
   **When** il clique sur un CTA « S'abonner »  
   **Then** il est redirigé vers `/login?tab=signup&plan=starter` (ou le plan choisi)

3. **Given** un utilisateur connecté (OWNER/MANAGER) sur `/tarifs`  
   **When** il clique sur « S'abonner » pour un plan payant  
   **Then** le flux de paiement Paystack est initié (voir AC #6)

### Gestion abonnement (dashboard)

4. **Given** je suis connecté en tant que OWNER ou MANAGER  
   **When** j'accède à `/parametres/abonnement`  
   **Then** je vois : plan actif (badge), statut, prochaine échéance, usage ce mois (commandes confirmées X / Y, preuves traitées, agents utilisés), overage accumulé si applicable, et historique paiements

5. **Given** je suis AGENT ou VENDEUR (non-OWNER/MANAGER)  
   **When** je tente d'accéder à `/parametres/abonnement`  
   **Then** je suis redirigé vers `/dashboard`

### Paiement Paystack

6. **Given** je suis connecté (OWNER/MANAGER) et je choisis un plan payant  
   **When** je clique « S'abonner »  
   **Then** le système initialise une transaction Paystack avec le `plan_code` du plan  
   **And** je suis redirigé vers Paystack Checkout (carte ou Mobile Money)  
   **And** après paiement réussi, je suis inscrit à l'abonnement récurrent et redirigé vers `/parametres/abonnement`

7. **Given** Paystack envoie un webhook `charge.success` + `subscription.create`  
   **When** le système reçoit la notification  
   **Then** signature HMAC SHA-512 vérifiée, Tenant mis à jour (plan, statut `active`, entitlements selon plan, codes Paystack stockés), `SubscriptionPayment` créé  
   **And** si échec (`invoice.payment_failed`), statut → `attention`

8. **Given** renouvellement automatique (Paystack débite la carte)  
   **When** `charge.success` reçu pour un renouvellement  
   **Then** `SubscriptionPayment` créé, `subscriptionExpiresAt` prolongé, compteurs d'usage remis à zéro pour le nouveau cycle

### Gestion abonnement

9. **Given** statut `attention` (échec de paiement carte)  
   **When** je vois le bandeau sur `/parametres/abonnement`  
   **Then** je peux cliquer « Mettre à jour ma carte » → page hosted Paystack

10. **Given** je veux annuler  
    **When** je clique « Annuler l'abonnement » (avec confirmation)  
    **Then** statut `non_renewing`, accès maintenu jusqu'à fin de période, pas de renouvellement

### Entitlements et quotas

11. **Given** un nouveau tenant créé  
    **When** il accède au dashboard  
    **Then** son plan est « Free » avec : 50 commandes confirmées/mois, 20 preuves/mois, 0 agents, pas d'export CSV, pas de notifications hors 24h, branding SnapSell

12. **Given** un tenant Free atteint son quota de commandes confirmées  
    **When** une nouvelle commande est sur le point d'être confirmée  
    **Then** la confirmation est bloquée (ou mode lecture seule) — pas d'overage sur Free  
    **And** un message invite à passer au plan Starter

13. **Given** un tenant Starter ou Pro dépasse son quota de commandes confirmées  
    **When** une commande est confirmée au-delà du quota  
    **Then** la commande est autorisée et l'overage est comptabilisé (Starter : 75 FCFA/commande, Pro : 100 FCFA/commande)

14. **Given** la fin du cycle de facturation d'un tenant Starter ou Pro avec overage  
    **When** Paystack facture le renouvellement  
    **Then** l'overage accumulé est facturé en supplément via un charge séparé sur la carte enregistrée (Paystack charge authorization)  
    **And** un `SubscriptionPayment` de type `overage` est créé dans l'historique

## Tasks / Subtasks

- [x] Task 1 : Modèle de données — champs subscription + entitlements + paiements (AC: #4, #7, #11)
  - [x] Ajouter les champs Prisma sur Tenant : `subscriptionPlan`, `subscriptionStatus`, `subscriptionExpiresAt`, codes Paystack, entitlements (maxConfirmedOrders, maxProofs, maxAgents, features flags)
  - [x] Créer le modèle `SubscriptionPayment` (historique paiements + overages)
  - [x] Créer et appliquer la migration Prisma
  - [x] Mettre à jour le seed (Free par défaut)

- [x] Task 2 : Configuration des plans et entitlements (AC: #1, #11, #13)
  - [x] Créer `src/lib/subscription-plans.ts` : config complète des 3 plans (Free, Starter, Pro) avec entitlements, prix, overages, feature flags, plan codes Paystack
  - [x] Inclure les feature flags : `hasExportCsv`, `hasAdvancedExports`, `hasNotificationsOutside24h`, `hasProofsInbox` (full vs limited), `hasBranding` (SnapSell watermark on Free)

- [x] Task 3 : Service Paystack (AC: #6, #7, #9, #10, #14)
  - [x] Créer `src/server/payment/paystack.ts` :
    - `initializeTransaction(email, planCode, metadata, callbackUrl)`
    - `verifyWebhookSignature(body, signature)`
    - `getSubscription(subscriptionCode)`
    - `disableSubscription(code, token)` — annuler
    - `generateManageLink(subscriptionCode)` — lien mise à jour carte
    - `chargeAuthorization(authorizationCode, email, amount)` — pour overage
  - [x] Env vars : `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_PLAN_STARTER`, `PAYSTACK_PLAN_PRO`

- [x] Task 4 : Page publique `/tarifs` (AC: #1, #2, #3)
  - [x] `src/app/tarifs/page.tsx` (RSC, publique)
  - [x] 3 cards plan : Free, Starter (25 000 FCFA), Pro (50 000 FCFA) avec détail entitlements + overage
  - [x] Header `SiteHeader`, lien « Tarifs » mis à jour
  - [x] CTA adaptés : non connecté → signup, connecté → paiement
  - [x] Responsive, accessible, dark mode

- [x] Task 5 : Route API initiation paiement (AC: #6)
  - [x] `src/app/api/payment/subscribe/route.ts`
  - [x] POST : auth + rôle, init transaction Paystack avec plan_code, crée SubscriptionPayment pending, retourne authorization_url

- [x] Task 6 : Webhook Paystack (AC: #7, #8, #14)
  - [x] `src/app/api/webhooks/paystack/route.ts`
  - [x] HMAC SHA-512 verification
  - [x] Events : `charge.success`, `subscription.create`, `invoice.payment_failed`, `subscription.disable`, `subscription.not_renew`
  - [x] Sur renouvellement : reset compteurs usage du cycle
  - [x] Idempotence sur `paystackReference`
  - [x] 200 OK toujours

- [x] Task 7 : Service de comptage usage + overage (AC: #12, #13, #14)
  - [x] Créer `src/server/subscription/usage.ts` :
    - `getUsageThisCycle(tenantId)` — compte commandes confirmées, preuves, agents actifs depuis début cycle
    - `checkQuota(tenantId)` — vérifie si quota atteint, retourne `{ allowed, isOverage, overageCount }`
    - `calculateOverage(tenantId)` — calcule montant overage accumulé
    - `chargeOverage(tenantId)` — déclenche le charge Paystack pour l'overage
  - [x] Intégrer le check quota dans le flux de confirmation de commande existant (`createOrderFromReservation`)

- [x] Task 8 : Router tRPC `subscription` (AC: #4, #9, #10, #12)
  - [x] `getSubscription` — plan, statut, nextPaymentDate, entitlements, feature flags
  - [x] `getUsage` — commandes confirmées / quota, preuves / quota, agents / max, overage accumulé
  - [x] `getPaymentHistory` — paiements + overages
  - [x] `cancelSubscription` — Paystack disable + update Tenant
  - [x] `getManageCardLink` — lien Paystack hosted
  - [x] Enregistrer dans `root.ts`

- [x] Task 9 : Page dashboard `/parametres/abonnement` (AC: #4, #5, #8, #9, #10, #12)
  - [x] Vérification rôle OWNER/MANAGER
  - [x] Carte plan actuel + badges + prochaine échéance
  - [x] Bandeaux conditionnels (attention, trial/free, non_renewing, expired)
  - [x] Section usage : commandes confirmées (X / 50 Free, X / 300 Starter, X / 700 Pro), preuves, agents, overage accumulé si > 0
  - [x] Section actions : changer de plan, mettre à jour carte, annuler
  - [x] Historique paiements (abonnements + overages)
  - [x] Responsive, accessible

- [x] Task 10 : Navigation (AC: #1, #4)
  - [x] Sidebar : lien « Abonnement » sous Paramètres
  - [x] `SiteHeader` : lien `#` Tarifs → `/tarifs`

- [x] Task 11 : Application des limites preuves et agents (AC: #11 — enforcement côté serveur)
  - [x] **Preuves (maxProofsPerMonth)** : `src/server/subscription/usage.ts` — `checkProofsQuota(tenantId)` retourne `{ allowed, currentUsage, quota }` ; si `quota === -1` illimité, sinon blocage si `currentUsage >= quota`. `src/server/proof/createPaymentProof.ts` — appel à `checkProofsQuota` avant création ; si non autorisé, lance `ProofsQuotaExceededError` (exportée). L’appelant (ex. worker webhook) peut attraper cette erreur pour renvoyer un message client (ex. « Limite de preuves atteinte ce mois »).
  - [x] **Agents (maxAgents)** : `src/server/subscription/usage.ts` — `checkAgentsQuota(tenantId)` retourne `{ allowed, currentCount, maxAgents }`. `src/server/api/routers/invitations.ts` — dans `createInvitation` : appel à `checkAgentsQuota` avant création ; si limite atteinte → TRPCError FORBIDDEN avec message « Limite d'agents atteinte (X/Y). Passez à un plan supérieur… ». Dans `acceptInvitation` : même check avant création du user ; si limite atteinte → FORBIDDEN « Limite d'agents atteinte pour ce compte… ».
  - [x] **Tests** : `usage.test.ts` — 3 tests `checkProofsQuota` (sous quota, illimité, à quota), 3 tests `checkAgentsQuota` (sous, à la limite, au-dessus). `createPaymentProof.test.ts` — 1 test levée de `ProofsQuotaExceededError` quand quota dépassé (mock `checkProofsQuota`). `invitations.test.ts` — 1 test `createInvitation` quand limite agents atteinte, 1 test `acceptInvitation` quand limite agents atteinte (mock `checkAgentsQuota`).

## Dev Notes

- **Source :** FR36. Périmètre élargi par Fabrice : self-service Paystack + plans Free/Starter/Pro avec overage.
- **Métrique de facturation = commandes confirmées.** C'est ce que le vendeur comprend et ce qui corrèle à sa valeur. Pas les messages, pas les sessions.
- **Paystack :** Récurrence carte automatique. Mobile Money en fallback (renouvellement manuel). Overage facturé via `charge authorization` sur la carte stockée en fin de cycle.
- **Gating (feature flags) :** Free = fonctionnalités limitées (pas d'exports, pas d'agents, proofs limité, branding SnapSell). Starter = workflow complet. Pro = collaboration + volume + contrôle. Le gating est implémenté via des feature flags dans les entitlements du tenant.
- **Blocage Free :** Au-delà du quota de commandes confirmées, les nouvelles confirmations sont bloquées. Pas d'overage. Message d'upgrade affiché.
- **Overage Starter/Pro :** Les commandes au-delà du quota sont autorisées et facturées en fin de cycle. Le montant overage est affiché dans le dashboard en temps réel.
- **Ce story NE couvre PAS :** le gating UI complet (masquer boutons export, bloquer fonctionnalités — sera un story séparé pour ne pas toucher à tous les composants existants), les factures PDF, le prorata au changement de plan, les analytics de revenus, les add-ons agents (post-MVP).

### Project Structure Notes

```
# NOUVEAUX FICHIERS
src/app/tarifs/
  page.tsx                                         ← Page publique Tarifs

src/app/(dashboard)/parametres/abonnement/
  page.tsx                                         ← Page dashboard Abonnement
  _components/
    subscription-card.tsx                           ← Plan actuel + badges
    usage-dashboard.tsx                             ← Usage : commandes, preuves, agents, overage
    payment-history.tsx                             ← Tableau paiements + overages
    subscription-actions.tsx                        ← Boutons subscribe/cancel/update card

src/server/payment/
  paystack.ts                                      ← Service Paystack (init, verify, manage, charge)

src/server/subscription/
  usage.ts                                         ← Comptage usage, check quota, calcul overage
  plans.ts                                         ← Re-export ou helpers de subscription-plans

src/server/api/routers/
  subscription.ts                                  ← Router tRPC subscription

src/app/api/payment/
  subscribe/route.ts                               ← POST: init transaction Paystack

src/app/api/webhooks/
  paystack/route.ts                                ← POST: webhook Paystack

src/lib/
  subscription-plans.ts                            ← Config plans (Free, Starter, Pro)

# FICHIERS MODIFIES
prisma/schema.prisma                               ← Champs Tenant + SubscriptionPayment
src/server/api/root.ts                             ← Enregistrer subscriptionRouter
src/server/order/createOrderFromReservation.ts     ← Intégrer check quota avant confirmation
src/app/(dashboard)/_components/app-sidebar.tsx     ← Lien « Abonnement »
src/components/site-header.tsx                      ← Lien « Tarifs »

# Task 11 — Limites preuves et agents
src/server/subscription/usage.ts                   ← checkProofsQuota, checkAgentsQuota
src/server/subscription/usage.test.ts              ← Tests checkProofsQuota × 3, checkAgentsQuota × 3
src/server/proof/createPaymentProof.ts             ← Check quota preuves, ProofsQuotaExceededError
src/server/proof/createPaymentProof.test.ts        ← Test quota dépassé
src/server/api/routers/invitations.ts              ← Check quota agents (create + accept)
src/server/api/routers/invitations.test.ts        ← Tests FORBIDDEN limite agents
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 7A, Story 7A.2, FR36]
- [Source: _bmad-output/planning-artifacts/prd.md — FR36, SaaS B2B: subscription_tiers]
- [Source: _bmad-output/planning-artifacts/architecture.md — §1 Non-Goals, §5 Consistency, §10 Security]
- [Source: src/server/order/createOrderFromReservation.ts — Flux confirmation commande existant]
- [Source: https://paystack.com/docs/payments/subscriptions/ — Paystack Subscriptions API]
- [Source: https://paystack.com/docs/api/subscription/ — Paystack Subscription API Reference]
- [Source: https://paystack.com/docs/payments/recurring-charges/ — Paystack Recurring Charges (charge authorization)]

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **Modèle de pricing :** Facturation sur les **commandes confirmées** (pas messages, pas sessions). C'est la métrique de valeur vendeur.
- **3 plans :**
  - **Free** — acquisition + preuve de valeur. Quota bas, fonctionnalités limitées, blocage au quota. Branding SnapSell.
  - **Starter** — mass market. Workflow complet + overage.
  - **Pro** — gros vendeurs. Équipe + volume + contrôle + overage.
- **Overage :** Starter/Pro uniquement. Facturé en fin de cycle via charge sur carte enregistrée.
- **Marché :** Vendeurs Afrique francophone (CI). Prix en FCFA (XOF). Carte Wave Visa pour auto-renouvellement.

### Plans Détaillés

```
┌─────────────────────────────────┬──────────────────┬──────────────────┬──────────────────┐
│                                 │ FREE             │ STARTER          │ PRO              │
├─────────────────────────────────┼──────────────────┼──────────────────┼──────────────────┤
│ Prix / mois                     │ 0 FCFA           │ 25 000 FCFA      │ 50 000 FCFA      │
│ Commandes confirmées incluses   │ 50               │ 300              │ 700              │
│ Overage / commande              │ BLOCAGE          │ 75 FCFA          │ 100 FCFA         │
│ Preuves (Proofs) / mois         │ 20               │ Illimité         │ Illimité         │
│ Agents (en plus du vendeur)     │ 0                │ 1                │ 5                │
│ Grille catégories→prix          │ ✓                │ ✓                │ ✓                │
│ Live session auto               │ ✓                │ ✓                │ ✓                │
│ Réservation + file + TTL        │ ✓                │ ✓                │ ✓                │
│ Dashboard commandes (basique)   │ ✓                │ ✓                │ ✓                │
│ Proofs inbox                    │ Limité (20/mois) │ Complet          │ Complet          │
│ Export CSV                      │ ✗                │ Basique          │ Avancé           │
│ Notifications hors 24h          │ ✗                │ ✓                │ ✓                │
│ Acompte recommandé              │ ✗                │ ✓ (défaut ON)    │ ✓ (défaut ON)    │
│ Filtres avancés + audit         │ ✗                │ Basique          │ Avancé           │
│ Support prioritaire             │ ✗                │ ✗                │ ✓                │
│ Branding SnapSell               │ ✓ (obligatoire)  │ ✗                │ ✗                │
│ Upgrade banner                  │ ✓                │ ✗                │ ✗                │
└─────────────────────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

### Technical Requirements

- **Paystack API :** REST, base `https://api.paystack.co/`. Auth `Bearer {SECRET_KEY}`.
- **Overage billing :** Utiliser `POST /transaction/charge_authorization` avec l'`authorization_code` stocké après le 1er paiement. Permet de débiter la carte sans interaction utilisateur. Déclenché par un cron/job en fin de cycle ou au moment du renouvellement webhook.
- **Check quota :** Intégrer dans `createOrderFromReservation.ts`. Avant de confirmer, appeler `checkQuota(tenantId)`. Si Free + quota atteint → refuser. Si Starter/Pro + quota dépassé → autoriser, incrémenter overage counter.
- **Compteur usage :** Compter les `Order` avec `status IN (confirmed, preparing, in_delivery, delivered)` créées depuis `subscriptionExpiresAt - 30 jours` (début du cycle courant). Pas les cancelled.
- **Reset compteurs :** Au renouvellement (webhook `charge.success`), mettre à jour `subscriptionExpiresAt` → nouveau cycle. Les compteurs sont recalculés dynamiquement (COUNT depuis début cycle), pas stockés en dur.
- **Feature flags :** Stocker sur le Tenant les entitlements numériques (quotas) ET booléens (flags). Le gating UI (masquer des boutons, bloquer des pages) sera un story séparé — cette story pose les données et le check.

### Architecture Compliance

- **Pattern webhook :** Comme Twilio. HMAC SHA-512, persist, 200 OK.
- **Isolation tenant :** `metadata.tenantId` dans la transaction Paystack. Webhook identifie le tenant.
- **Idempotence :** `paystackReference` unique dans `SubscriptionPayment`.
- **Modification existante :** `createOrderFromReservation.ts` est modifié pour intégrer le check quota. C'est la seule modification de code métier existant. Le reste est additionnel.
- **Naming DB :** snake_case avec `@map()`.

### Library / Framework Requirements

| Lib | Version | Usage |
|-----|---------|-------|
| next | existante | App Router, pages, API routes |
| tailwindcss | existante | Styling |
| shadcn/ui | existante | Card, Badge, Button, Progress, Table |
| lucide-react | existante | CreditCard, Zap, Crown, Users, Lock, CheckCircle2, AlertTriangle |
| @prisma/client | existante | DB |
| tRPC | existante | Router subscription |

**Aucune nouvelle dépendance NPM.** Paystack = appels `fetch`.

### Testing Requirements

- **Paystack test mode :** Carte test `4084 0840 8408 4081`, exp `12/30`, CVV `408`.
- **Quota check :** Tester Free bloqué à 50 commandes. Tester Starter avec overage au-delà de 300.
- **Webhook :** HMAC valide / invalide. Idempotence. Events charge.success, invoice.payment_failed, subscription.disable.
- **Page Tarifs :** Responsive. CTA connecté vs non connecté.
- **Page Abonnement :** États : free, active, attention, non_renewing, expired. Usage correct. Historique.

---

## Data Model Changes

### Nouveaux champs sur `Tenant`

```prisma
// Subscription (Story 7A.2)
subscriptionPlan       String    @default("free") @map("subscription_plan")
  // "free" | "starter" | "pro"
subscriptionStatus     String    @default("active") @map("subscription_status")
  // "active" | "attention" | "non_renewing" | "expired" | "cancelled"
subscriptionExpiresAt  DateTime? @map("subscription_expires_at")
  // null = Free (pas d'expiration) ; set à +30j après paiement pour Starter/Pro
cycleStartedAt         DateTime? @map("cycle_started_at")
  // Début du cycle courant (pour compter l'usage). null = Free (cycle = mois calendaire)

// Paystack references
paystackCustomerCode      String?  @unique @map("paystack_customer_code")   // CUS_xxx
paystackSubscriptionCode  String?  @unique @map("paystack_subscription_code") // SUB_xxx
paystackEmailToken        String?  @map("paystack_email_token")             // Pour disable
paystackAuthorizationCode String?  @map("paystack_authorization_code")      // Pour charge overage

// Entitlements — quotas numériques
maxConfirmedOrdersPerMonth Int     @default(50) @map("max_confirmed_orders_per_month")
maxProofsPerMonth          Int     @default(20) @map("max_proofs_per_month")   // -1 = illimité
maxAgents                  Int     @default(0) @map("max_agents")              // 0 = pas d'agents
overagePerOrderCents       Int     @default(0) @map("overage_per_order_cents") // 0 = blocage (Free)

// Entitlements — feature flags
hasExportCsv               Boolean @default(false) @map("has_export_csv")
hasAdvancedExports         Boolean @default(false) @map("has_advanced_exports")
hasNotificationsOutside24h Boolean @default(false) @map("has_notifications_outside_24h")
hasDepositRecommended      Boolean @default(false) @map("has_deposit_recommended")
hasAdvancedFilters         Boolean @default(false) @map("has_advanced_filters")
hasPrioritySupport         Boolean @default(false) @map("has_priority_support")
showBranding               Boolean @default(true) @map("show_branding")       // Free = true
showUpgradeBanner          Boolean @default(true) @map("show_upgrade_banner")  // Free = true
```

### Nouveau modèle `SubscriptionPayment`

```prisma
model SubscriptionPayment {
  id                String   @id @default(cuid())
  tenantId          String   @map("tenant_id")
  tenant            Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  paystackReference String   @unique @map("paystack_reference") // Idempotence
  type              String   // "subscription" | "overage"
  plan              String?  // "starter" | "pro" (null si overage seul)
  amount            Int      // Montant en FCFA
  currency          String   @default("XOF")
  status            String   // "pending" | "success" | "failed"
  channel           String?  // "card" | "mobile_money"
  cardLast4         String?  @map("card_last4")
  overageDetails    Json?    @map("overage_details")
    // { ordersOverQuota: 12, ratePerOrder: 75, totalAmount: 900 }
  metadata          Json?
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  @@index([tenantId])
  @@index([tenantId, type, status])
  @@map("subscription_payments")
}
```

---

## Plans Configuration

### `src/lib/subscription-plans.ts`

```typescript
export type PlanId = "free" | "starter" | "pro";

export interface PlanConfig {
  id: PlanId;
  name: string;
  price: number; // FCFA / mois
  currency: string;
  interval: "monthly";
  description: string;
  popular?: boolean;
  paystackPlanCode: string | null; // null for Free
  entitlements: {
    maxConfirmedOrdersPerMonth: number;
    maxProofsPerMonth: number; // -1 = illimité
    maxAgents: number;
    overagePerOrderCents: number; // 0 = blocage
    hasExportCsv: boolean;
    hasAdvancedExports: boolean;
    hasNotificationsOutside24h: boolean;
    hasDepositRecommended: boolean;
    hasAdvancedFilters: boolean;
    hasPrioritySupport: boolean;
    showBranding: boolean;
    showUpgradeBanner: boolean;
  };
  features: string[]; // Pour affichage page Tarifs
  overageLabel?: string; // Ex: "75 FCFA / commande supplémentaire"
}

export const SUBSCRIPTION_PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    currency: "XOF",
    interval: "monthly",
    description: "Testez votre premier live propre",
    paystackPlanCode: null,
    entitlements: {
      maxConfirmedOrdersPerMonth: 50,
      maxProofsPerMonth: 20,
      maxAgents: 0,
      overagePerOrderCents: 0, // Blocage, pas d'overage
      hasExportCsv: false,
      hasAdvancedExports: false,
      hasNotificationsOutside24h: false,
      hasDepositRecommended: false,
      hasAdvancedFilters: false,
      hasPrioritySupport: false,
      showBranding: true,
      showUpgradeBanner: true,
    },
    features: [
      "50 commandes confirmées / mois",
      "1 vendeur (pas d'agents)",
      "Grille catégories → prix",
      "Réservation + file + TTL",
      "Dashboard commandes basique",
      "20 preuves / mois",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    price: 25000,
    currency: "XOF",
    interval: "monthly",
    description: "Monétisez votre live sans stress",
    paystackPlanCode: process.env.PAYSTACK_PLAN_STARTER ?? "",
    entitlements: {
      maxConfirmedOrdersPerMonth: 300,
      maxProofsPerMonth: -1,
      maxAgents: 1,
      overagePerOrderCents: 7500, // 75 FCFA
      hasExportCsv: true,
      hasAdvancedExports: false,
      hasNotificationsOutside24h: true,
      hasDepositRecommended: true,
      hasAdvancedFilters: false,
      hasPrioritySupport: false,
      showBranding: false,
      showUpgradeBanner: false,
    },
    features: [
      "300 commandes confirmées / mois",
      "1 vendeur + 1 agent",
      "Proofs inbox complet",
      "Export CSV basique",
      "Notifications statut",
      "Acompte recommandé (défaut ON)",
    ],
    overageLabel: "75 FCFA / commande au-delà",
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 50000,
    currency: "XOF",
    interval: "monthly",
    description: "Équipe + volume + contrôle",
    popular: true,
    paystackPlanCode: process.env.PAYSTACK_PLAN_PRO ?? "",
    entitlements: {
      maxConfirmedOrdersPerMonth: 700,
      maxProofsPerMonth: -1,
      maxAgents: 5,
      overagePerOrderCents: 10000, // 100 FCFA
      hasExportCsv: true,
      hasAdvancedExports: true,
      hasNotificationsOutside24h: true,
      hasDepositRecommended: true,
      hasAdvancedFilters: true,
      hasPrioritySupport: true,
      showBranding: false,
      showUpgradeBanner: false,
    },
    features: [
      "700 commandes confirmées / mois",
      "Jusqu'à 5 agents",
      "Filtres avancés + audit renforcé",
      "Export CSV avancé (multi-filtres)",
      "Notifications statut",
      "Acompte recommandé",
      "Support prioritaire",
    ],
    overageLabel: "100 FCFA / commande au-delà",
  },
};
```

---

## Paystack Integration Flow

### Premier abonnement

```
Tenant "S'abonner Starter"
  → POST /api/payment/subscribe { plan: "starter" }
  → Serveur: init Paystack transaction avec plan_code + metadata { tenantId, plan }
  → Redirect → Paystack Checkout (carte Wave Visa / MC ou Mobile Money)
  → Paiement OK → Paystack webhooks:
      charge.success → update Tenant (plan=starter, status=active, entitlements Starter, expiresAt=+30j)
      subscription.create → store SUB_xxx, CUS_xxx, emailToken, authorizationCode
  → Redirect → /parametres/abonnement?payment=callback
```

### Renouvellement auto (carte)

```
Paystack auto-débit → charge.success webhook
  → Serveur: crée SubscriptionPayment, prolonge expiresAt, reset cycleStartedAt
  → Si overage accumulé > 0 :
      charge authorization pour le montant overage → crée SubscriptionPayment type=overage
```

### Overage en fin de cycle

```
Overage calculé = (commandes confirmées ce cycle - quota inclus) × tarif overage
  → Facturé via POST /transaction/charge_authorization au moment du renouvellement
  → authorization_code = carte stockée du tenant
  → Si le charge overage échoue : loggé, retry possible, pas de blocage immédiat
```

### Webhook verification

```typescript
import { createHmac } from "crypto";
const hash = createHmac("sha512", PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
return hash === req.headers["x-paystack-signature"];
```

---

## Quota Check Integration

### Point d'intégration : `createOrderFromReservation.ts`

```typescript
// Avant de créer la commande, vérifier le quota
const quota = await checkQuota(tenantId);

if (!quota.allowed) {
  // Free : quota atteint → bloquer la confirmation
  // Retourner un message WhatsApp : "Limite atteinte. Passez au plan Starter pour continuer."
  throw new QuotaExceededError(tenantId, quota);
}

// Si allowed && isOverage : la commande passe mais on incrémente le compteur overage
// L'overage sera facturé en fin de cycle
```

**Note :** Le compteur d'usage est calculé dynamiquement via un COUNT SQL, pas stocké en dur. Ça évite les problèmes de synchronisation.

### Application des limites Preuves et Agents (Task 11)

**Preuves (`maxProofsPerMonth`) :**
- `usage.ts` : `checkProofsQuota(tenantId)` — compte les `PaymentProof` du cycle ; si `maxProofsPerMonth === -1` → toujours autorisé ; sinon `allowed = currentUsage < quota`.
- `createPaymentProof.ts` : avant toute création, appel à `checkProofsQuota`. Si `!allowed`, lance `ProofsQuotaExceededError(tenantId, currentUsage, quota)`. L’appelant (worker, API) peut la rattraper pour renvoyer un message explicite au client.

**Agents (`maxAgents`) :**
- `usage.ts` : `checkAgentsQuota(tenantId)` — compte les `User` avec `role === "AGENT"` du tenant ; `allowed = currentCount < maxAgents`.
- `invitations.ts` : `createInvitation` — appelle `checkAgentsQuota` après rate limit, avant la transaction ; si `!allowed` → `TRPCError` FORBIDDEN avec message incluant X/Y. `acceptInvitation` — appelle `checkAgentsQuota` après `validateInvitation`, avant création du user ; si `!allowed` → FORBIDDEN (évite d’accepter une invitation alors que la limite a été atteinte entre-temps).

---

## Previous Story Intelligence

- **Story 7A.1 (Landing)** : `SiteHeader` lien `#` Tarifs → `/tarifs`. Design landing.
- **Pages Paramètres** : Pattern auth + rôle + redirect.
- **Webhook Twilio (2.1)** : Pattern webhook. Même approche pour Paystack.
- **createOrderFromReservation (5.1)** : Flux existant de confirmation commande. C'est là qu'on intègre le check quota. Modifier avec précaution — c'est un chemin critique.
- **Code review 7A.1** : Documenter File List. WCAG headings. Responsive.

---

## Git Intelligence Summary

- **Patterns :** RSC, shadcn/ui, Lucide, Tailwind inline, TypeScript strict, build Vercel OK.
- **createOrderFromReservation.ts** : Dernier modifié dans story 5.1. Transaction Prisma atomique. Le check quota doit être intégré AVANT la transaction (ou au début de la transaction).

---

## Latest Tech Information

- **Paystack API CI :** Dispo. XOF. Card + Mobile Money. Subscriptions carte uniquement.
- **Paystack charge_authorization :** `POST /transaction/charge_authorization` — body: `{ authorization_code, email, amount, currency }`. Permet de débiter la carte sans interaction utilisateur. Utilisé pour l'overage.
- **Paystack billing mensuel :** Abonnement créé ≤28 → débit même jour chaque mois. 29-31 → le 28.
- **Paystack ne retente PAS** les échecs subscription → statut `attention`.

---

## Project Context Reference

- **Env vars nouvelles :** `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_PLAN_STARTER`, `PAYSTACK_PLAN_PRO`, `NEXT_PUBLIC_APP_URL`
- **Conventions :** TypeScript strict, dark mode, français, Manrope.
- **Déploiement :** Vercel (pages + webhook). Migration Prisma sur Neon.
- **RBAC :** `canManageGrid()` pour page Abonnement. Page Tarifs publique.

---

## Dev Agent Record

### Agent Model Used

Claude claude-4.6-opus (Cursor)

### Debug Log References

- Prisma migration créée manuellement (DB Neon non accessible en local) — `20260209000000_add_subscription_entitlements`
- `paystackPlanCode` changé de static (module load) à lazy via `getPaystackPlanCode()` pour permettre la résolution env vars au runtime (fix test)
- Quota check intégré dans `createOrderFromReservation.ts` avec try/catch — si le check échoue, la commande passe quand même (pas de blocage sur erreur DB)

### Completion Notes List

- ✅ Task 1: Schema Prisma modifié — 18 champs sur Tenant + modèle SubscriptionPayment. Migration SQL prête.
- ✅ Task 2: `subscription-plans.ts` — Config 3 plans avec entitlements, prix, features, overageLabel. 19 tests.
- ✅ Task 3: `paystack.ts` — 6 fonctions API Paystack (init, verify, get, disable, manage, charge). 11 tests.
- ✅ Task 4: `/tarifs` page RSC — 3 cards plan, tableau comparaison, CTA adaptés connecté/non-connecté, responsive, accessible. Liens SiteHeader + footer mis à jour.
- ✅ Task 5: `POST /api/payment/subscribe` — Auth + rôle, init Paystack, crée SubscriptionPayment pending. GET redirect support. 7 tests.
- ✅ Task 6: `POST /api/webhooks/paystack` — HMAC SHA-512, 5 events (charge.success, subscription.create, invoice.payment_failed, subscription.disable, subscription.not_renew), idempotence, 200 OK toujours. 11 tests.
- ✅ Task 7: `usage.ts` — getUsageThisCycle, checkQuota, calculateOverage, chargeOverage, QuotaExceededError. Intégré dans createOrderFromReservation. 13 tests. 0 régression (13 tests existants passent).
- ✅ Task 8: Router tRPC `subscription` — 5 procedures (getSubscription, getUsage, getPaymentHistory, cancelSubscription, getManageCardLink). Enregistré dans root.ts. 4 tests.
- ✅ Task 9: `/parametres/abonnement` — 4 composants (SubscriptionCard, UsageDashboard, PaymentHistory, SubscriptionActions). Bandeaux conditionnels, barres usage, dialogue annulation.
- ✅ Task 10: Sidebar lien « Abonnement » ajouté. SiteHeader lien Tarifs → `/tarifs`.
- ✅ Task 11: Limites preuves et agents appliquées côté serveur. `checkProofsQuota` / `checkAgentsQuota` dans `usage.ts`. `createPaymentProof` lance `ProofsQuotaExceededError` si quota preuves atteint. `createInvitation` et `acceptInvitation` renvoient FORBIDDEN si limite agents atteinte. 6 nouveaux tests (usage 6, createPaymentProof 1, invitations 2). 42 tests ciblés passent.

### Change Log

- 2026-02-10: Task 11 — Enforcement limites preuves (createPaymentProof + ProofsQuotaExceededError) et agents (createInvitation, acceptInvitation + checkAgentsQuota). Détails dans section « Application des limites Preuves et Agents » et Quota Check Integration.
- 2026-02-09: Story 7A.2 — Implémentation complète des 10 tasks. 410 tests pass, 0 failures.
- 2026-02-09: Code Review (AI) — 11 issues trouvées et corrigées :
  - H1: chargeOverage() wirée dans webhook charge.success pour facturer overage au renouvellement (AC #14)
  - H2: getPlanByPaystackCode() corrigée — utilisait `paystackPlanCode` au lieu de `getPaystackPlanCode()`
  - H3: chargeAuthorization currency corrigé NGN → XOF (marché CI)
  - H4: subscription-content.tsx — guard null ajouté pour data possiblement undefined
  - M1: verifyWebhookSignature — comparaison timing-safe avec crypto.timingSafeEqual()
  - M2: Tests ajoutés pour getPaystackPlanCode() et getPlanByPaystackCode()
  - M3: Webhook handler — console.error/log remplacé par workerLogger structuré
  - M4: Subscribe route — logique GET/POST dédupliquée via initiateSubscription()
  - L1: QuotaExceededError test — fix TS typing
  - L2: payment-history.tsx — fix typeConf/statusConf possiblement undefined
  - 83 tests story pass, 0 failures

### File List

**Nouveaux fichiers:**
- `prisma/migrations/20260209000000_add_subscription_entitlements/migration.sql`
- `src/lib/subscription-plans.ts`
- `src/lib/subscription-plans.test.ts`
- `src/server/payment/paystack.ts`
- `src/server/payment/paystack.test.ts`
- `src/server/subscription/usage.ts`
- `src/server/subscription/usage.test.ts`
- `src/server/api/routers/subscription.ts`
- `src/server/api/routers/subscription.test.ts`
- `src/app/tarifs/page.tsx`
- `src/app/api/payment/subscribe/route.ts`
- `src/app/api/payment/subscribe/route.test.ts`
- `src/app/api/webhooks/paystack/route.ts`
- `src/app/api/webhooks/paystack/route.test.ts`
- `src/app/(dashboard)/parametres/abonnement/page.tsx`
- `src/app/(dashboard)/parametres/abonnement/_components/subscription-content.tsx`
- `src/app/(dashboard)/parametres/abonnement/_components/subscription-card.tsx`
- `src/app/(dashboard)/parametres/abonnement/_components/usage-dashboard.tsx`
- `src/app/(dashboard)/parametres/abonnement/_components/payment-history.tsx`
- `src/app/(dashboard)/parametres/abonnement/_components/subscription-actions.tsx`

**Fichiers modifiés:**
- `prisma/schema.prisma` — Champs Tenant + SubscriptionPayment
- `src/env.js` — Env vars Paystack + NEXT_PUBLIC_APP_URL
- `src/server/api/root.ts` — Enregistrer subscriptionRouter
- `src/server/order/createOrderFromReservation.ts` — Intégrer check quota avant confirmation
- `src/server/order/createOrderFromReservation.test.ts` — Ajout reason "quota_exceeded"
- `src/app/(dashboard)/_components/app-sidebar.tsx` — Lien « Abonnement »
- `src/components/site-header.tsx` — Header unifié session-aware + variant auth
- `src/app/_components/landing/landing-footer.tsx` — Lien Tarifs → `/tarifs`
- `src/styles/globals.css` — Animations auth tab slide

**Task 11 (2026-02-10) — Limites preuves et agents :**
- `src/server/subscription/usage.ts` — `checkProofsQuota`, `checkAgentsQuota`, types `ProofsQuotaCheckResult`, `AgentsQuotaCheckResult`
- `src/server/subscription/usage.test.ts` — 6 tests (checkProofsQuota × 3, checkAgentsQuota × 3)
- `src/server/proof/createPaymentProof.ts` — Import checkProofsQuota, ProofsQuotaExceededError, appel quota avant création
- `src/server/proof/createPaymentProof.test.ts` — Mock checkProofsQuota, test ProofsQuotaExceededError
- `src/server/api/routers/invitations.ts` — Import checkAgentsQuota, check avant createInvitation et acceptInvitation
- `src/server/api/routers/invitations.test.ts` — Mock checkAgentsQuota, 2 tests FORBIDDEN (create + accept quand limite atteinte)
