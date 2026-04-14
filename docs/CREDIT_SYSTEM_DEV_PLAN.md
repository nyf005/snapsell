# 🛠️ Plan d'Implémentation : Système de Crédits & Usage

Ce document détaille les étapes techniques pour mettre en place la facturation à l'usage (crédits) et la gestion des quotas par plan.

## 1. Modifications Base de Données (Prisma)
Ajouter les champs suivants à la table `Tenant` :
- `billingPlan`: Enum (`FREE`, `STARTER`, `PRO`).
- `creditsBalance`: Int (par défaut 70 pour le plan Free).
- `nextBillingDate`: DateTime.
- `usageResetDate`: DateTime.

Créer une table `ConversationWindow` :
- `id`: String.
- `tenantId`: String (FK).
- `customerPhone`: String.
- `expiresAt`: DateTime (24h après l'ouverture).

## 2. Logique du Webhook Processor
Modifier `processWebhookJob` pour inclure le flux suivant :

1. **Vérification de la fenêtre** :
   - Chercher une `ConversationWindow` active pour ce client.
   - Si aucune n'existe :
     - Vérifier `tenant.creditsBalance`.
     - Si > 0 : Déduire 1 crédit et créer une nouvelle `ConversationWindow`.
     - Si <= 0 : Passer en mode "Limites Atteintes" (pas d'IA, message d'alerte).

2. **Garde-fou IA** :
   - Si le plan est `FREE`, ignorer systématiquement l'appel à `analyzeInboundIntent` (retourner `intent: OTHER`).

## 3. Automatisation des Quotas (Cron Jobs)
Mettre en place un job périodique (`pg-boss` ou `cron`) qui :
- Vérifie les `usageResetDate` arrivant à échéance.
- Réinitialise le `creditsBalance` selon le plan actuel du vendeur.

## 4. Interface Vendeur (Frontend)
- **Composant Status Bar** : Afficher "Crédits restants : 145 / 500" dans le dashboard.
- **Page Facturation** :
  - Liste des plans.
  - Historique des achats de crédits.
  - Bouton "Acheter 100 crédits" -> Intégration Paystack (One-time payment).

## 5. Webhooks de Paiement (Paystack)
Créer une route `api/webhooks/paystack` :
- Si l'événement est `charge.success` (pour un pack de crédits) : Incrémenter `creditsBalance` du tenant concerné.

---
*Prochaine étape : Commencer par la modification du schéma Prisma.*
