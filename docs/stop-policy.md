# Politique STOP (opt-out) — Scope et messages après STOP

**Référence :** Story 7B.3, FR46, Architecture §7.

## 1. Scope STOP (tenant)

L'opt-out STOP est défini **par tenant** :

- **(tenant_id, phone_number)** identifie un opt-out.
- Un même numéro ayant envoyé STOP à un **autre** tenant n'est **pas** considéré opt-out pour ce tenant.
- Implémentation : table `opt_outs` avec contrainte unique `(tenant_id, phone_number)`.
- Détection STOP : `src/server/workers/webhook-processor.ts` (mots-clés STOP/arrêt/unsubscribe/optout, etc.) → création `OptOut` pour le tenant concerné.
- **Idempotence** : si un client envoie STOP plusieurs fois, le doublon est ignoré (contrainte unique sur `(tenant_id, phone_number)`). Aucune erreur côté système.

## 2. Politique « messages autorisés après STOP » (MVP)

**Règle produit MVP :** **Aucun message** après STOP.

- Dès qu'un `OptOut` existe pour (tenant_id, phone_number), **tous** les messages sortants vers ce numéro sont bloqués.
- Comportement implémenté dans `src/server/workers/outbox-sender.ts` : avant tout envoi, `checkOptOut(tenantId, to)` (défini dans `src/server/messaging/optout.ts`) ; si opt-out → statut `blocked`, événement `message_blocked_optout`, pas d'envoi au provider.
- Valeur par défaut sûre : tout est bloqué.

## 3. Option future : « Transactionnels stricts » (FR46)

Si le produit décide d'autoriser certains messages après STOP (ex. notifications de commande ou livraison), la règle pourra être **configurable par tenant** (ex. champ `allow_transactional_after_stop`) avec **valeur par défaut = false** (bloquer tout).

Types de messages considérés **transactionnels stricts** (liste de référence pour une évolution ultérieure) :

| Type                     | Description exemple                          |
|--------------------------|-----------------------------------------------|
| `order_status`           | Rappel / confirmation de commande            |
| `delivery_notification` | Notification de livraison                     |
| `security_alert`         | Alerte sécurité (ex. changement de compte)    |

Les messages marketing ou de rappel promotionnel restent **toujours** bloqués après STOP.

## 4. Cohérence avec l'ops console

- Les événements `message_blocked_optout` et `opt_out_recorded` restent inchangés (logs, file d'erreurs 7B.1 / 7B.2).
- Aucune modification des écrans ops requise pour cette politique.

## 5. Opt-back-in (UNSTOP)

**MVP :** Aucun mécanisme automatique d'opt-back-in n'est implémenté. Si un client souhaite recevoir à nouveau des messages après avoir envoyé STOP, le vendeur doit contacter l'équipe support pour supprimer manuellement l'enregistrement `OptOut` en base.

**Évolution possible :** Ajouter des mots-clés de re-souscription (ex. « START », « UNSTOP ») dans `webhook-processor.ts` pour supprimer l'`OptOut` automatiquement. Cette évolution sera traitée dans un story dédié si le besoin se confirme.
