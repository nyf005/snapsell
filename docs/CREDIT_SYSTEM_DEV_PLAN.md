# 🛠️ Plan d'Implémentation : Système de Crédits & Usage

Ce document détaille les étapes techniques pour mettre en place la facturation à l'usage (crédits) et la gestion des quotas par plan.

> ## État : livré, sauf le reset automatique
>
> | Étape | Statut |
> |---|---|
> | 1. Schéma Prisma | ✅ Livré (nommage adapté, voir ci-dessous) |
> | 2. Logique webhook processor | ✅ Livré |
> | 3. Reset mensuel automatique | ✅ Livré le 2026-07-28 |
> | 4. Interface vendeur | ✅ Livré |
> | 5. Webhook Paystack | ✅ Livré |

## 1. Modifications Base de Données (Prisma) — ✅ livré

Champs sur `Tenant` (le nommage final diffère du plan initial) :
- `subscriptionPlan`: String `@default("free")` — _prévu : enum `billingPlan`_
- `creditsBalance`: Int `@default(70)` ✅
- `creditsTotalMonthly`: Int `@default(70)` — _ajouté en cours de route_
- `creditsBonus`: Int `@default(0)` — _crédits achetés hors forfait_
- `usageResetDate`: DateTime? ✅
- `lowCreditsAlerted`: Boolean — _ajouté : alerte à 80 % de consommation_
- `cycleStartedAt`: DateTime? — _ajouté : borne le comptage mensuel_

> ⚠️ `nextBillingDate` n'a pas été retenu : `usageResetDate` + `cycleStartedAt` couvrent le besoin.

Table `ConversationWindow` ✅ — `id`, `tenantId`, `customerPhone`, `expiresAt`, `createdAt`, avec index `(tenantId, customerPhone)` et `(tenantId, expiresAt)`.

## 2. Logique du Webhook Processor — ✅ livré

Implémenté dans [`credits/service.ts`](../src/server/credits/service.ts), appelé depuis [`webhook-processor.ts`](../src/server/workers/webhook-processor.ts) :

1. **Vérification de la fenêtre** — `checkAndConsumeCredit(tenantId, clientPhoneE164)` cherche une `ConversationWindow` active, sinon décrémente un crédit et en ouvre une.
2. **Garde-fou IA** — `const hasAI = tenant?.subscriptionPlan !== "free"` : `analyzeInboundIntent()` n'est appelé que si le plan n'est pas gratuit.

### ⚠️ Concurrence — verrou obligatoire

L'ouverture d'une session prend un **verrou `FOR UPDATE` sur la ligne tenant**, et re-vérifie la fenêtre *à l'intérieur* de la transaction.

Sans ce verrou (état antérieur au 2026-07-28), deux messages rapprochés du même client traités en parallèle — le worker tourne en `localConcurrency: 5` — passaient tous deux le check « fenêtre active », lisaient le même solde et décrémentaient chacun un crédit : **double facturation** et `creditsBalance` pouvant devenir **négatif**.

Le chemin rapide (session déjà active) reste **sans verrou** : une conversation en cours ne doit pas sérialiser sur le tenant. Seule l'ouverture d'une nouvelle session est sérialisée.

Couvert par [`service.integration.test.ts`](../src/server/credits/service.integration.test.ts) — ces tests exigent une vraie base (`RUN_INTEGRATION_TESTS=true`), le verrou étant une garantie Postgres non simulable en mock.

## 3. Automatisation des Quotas (Cron Jobs) — ✅ livré

Job [`credits-monthly-reset.ts`](../src/server/workers/credits-monthly-reset.ts), planifié **toutes les heures** via `boss.schedule(QUEUE.CRON_CREDITS_MONTHLY_RESET, "0 * * * *")`. Il ne traite que les tenants dont `usageResetDate` est échue, ce qui lisse les renouvellements au lieu de tous les grouper à minuit.

Pour chaque tenant échu :
- `creditsBalance` ← `creditsTotalMonthly` du plan **courant**
- `creditsBonus` **n'est jamais réinitialisé** — les crédits achetés sont reportés
- `usageResetDate` avance d'un mois (en rattrapant les cycles manqués si le job a pris du retard, pour éviter la dérive)
- `cycleStartedAt` ← maintenant, `lowCreditsAlerted` ← `false`

Le job purge aussi les `conversation_windows` échues via `cleanupExpiredWindows()` — cette fonction existait mais n'était appelée nulle part, la table grossissait sans limite. L'échec de la purge n'empêche pas le renouvellement des crédits.

## 4. Interface Vendeur (Frontend) — ✅ livré

- `subscription.getCreditsUsage` expose solde, total mensuel, bonus, consommation, pourcentage, fenêtres actives, sessions du mois, date de reset et seuil d'alerte (`isLowCredits` à 80 %).
- Page **Paramètres → Abonnement** (`/parametres/abonnement`) : plans, historique, achat de crédits.
- Achat via `/api/payment/buy-credits` (Paystack one-time).

## 5. Webhooks de Paiement (Paystack) — ✅ livré

[`/api/webhooks/paystack`](../src/app/api/webhooks/paystack/route.ts) traite `charge.success` : pour un `credits_topup`, incrémente **`creditsBonus`** (et non `creditsBalance`, afin de distinguer les crédits achetés du forfait mensuel).

---
*Mis à jour le 28 juillet 2026. Seul point ouvert : le reset mensuel automatique (§3).*
