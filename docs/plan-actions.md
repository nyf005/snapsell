# Plan d'actions — SnapSell

## Ordre d'exécution

Les actions sont ordonnées par impact immédiat et dépendances techniques. Les phases 1 et 2 sont indépendantes et peuvent être menées en parallèle si plusieurs développeurs.

---

## Phase 1 — Messages et ton de voix
**Objectif : éliminer les réponses froides et mécaniques**
**Effort : 1–2 jours**
**Dépendances : aucune**

- [x] **1.1 Créer `src/server/messaging/templates.ts`**
  Centraliser tous les messages du bot dans un seul fichier. Remplacer tous les strings hardcodés dans `webhook-processor.ts` et les services associés.
  Messages à couvrir :
  - [x] Réservation confirmée
  - [x] Récapitulatif avant OUI (avec adresse du client incluse)
  - [x] Commande confirmée (avec et sans dépôt)
  - [x] Article épuisé / ajout waitlist
  - [x] Code introuvable
  - [x] Reminder avant expiration
  - [x] Réservation expirée
  - [x] Premier contact / accueil
  - [x] Message non reconnu (fallback)
  - [x] Réponse post-commande
  - [x] Notifications statut commande (livré, annulé, en livraison)
  - [x] Validation / rejet preuve d'acompte
  - [x] Promotion waitlist

- [x] **1.2 Remplacer les messages existants**
  Fichiers mis à jour :
  - [x] `src/server/workers/webhook-processor.ts`
  - [x] `src/server/order/createOrderFromReservation.ts`
  - [x] `src/server/workers/reservation-ttl.ts`
  - [x] `src/server/api/routers/orders.ts`
  - [x] `src/server/api/routers/proofs.ts` (approve + reject + bulk)
  - [x] `src/server/api/routers/live.ts`
  - [x] `src/server/live-item/createLiveItem.ts`

---

## Phase 2 — Automatisation des conversations manquantes
**Objectif : éliminer les messages ignorés et les silences du bot**
**Effort : 2–3 jours**
**Dépendances : Phase 1 (templates doivent exister)**

- [x] **2.1 Message d'accueil automatique**
  Détecte le premier contact d'un client (`MessageIn.count <= 1` pour ce `tenantId` + `from`). Envoie le message de bienvenue avec le nom de la boutique via `writeToOutbox()`.

- [x] **2.2 Fallback pour messages non reconnus**
  Handler ajouté en fin de routing dans `webhook-processor.ts`. Si aucun intent détecté et aucune réservation active → répond avec `botMsg.client.fallback()`.

- [x] **2.3 Message pour code introuvable sans session active**
  Couvert par `botMsg.client.codeUnknown()` — message chaleureux remplaçant l'erreur silencieuse.

- [x] **2.4 Réponse automatique post-commande**
  Si client écrit sans réservation active, cherche la dernière commande active (`confirmed`, `confirmed_pending_deposit`, `preparing`, `in_delivery`) et répond avec `botMsg.client.orderStatus()`.

---

## Phase 3 — Relances et expiration
**Objectif : zéro réservation expirée dans le silence**
**Effort : 2–3 jours**
**Dépendances : Phase 1**

- [x] **3.1 Reminder avant expiration de réservation**
  Déjà implémenté dans `reservation-ttl.ts` (`runReservationReminderJob()`). Le message `REMINDER_BODY` utilise maintenant `botMsg.client.reminder()`. Job déclenché depuis `/api/cron/reservation-ttl`.

- [x] **3.2 Message d'expiration**
  Ajout de `writeToOutbox()` dans `runReservationTtlJob()` après `logReservationExpired()`. Le client reçoit `botMsg.client.reservationExpired(code)` dès que sa réservation expire. Le message de promotion waitlist utilise également maintenant `botMsg.client.waitlistPromoted(code)`.

---

## Phase 4 — Dashboard commandes
**Objectif : permettre au vendeur de préparer les colis efficacement**
**Effort : 3–4 jours**
**Dépendances : aucune (indépendant des phases 1–3)**

- [x] **4.1 Vue groupée par client**
  Commandes regroupées par `clientPhone` dans `orders-list-content.tsx`. Pour chaque client :
  - [x] Ligne d'en-tête avec numéro, adresse de livraison, nombre de commandes
  - [x] Indicateur visuel "Statuts mixtes" si le client a des commandes à différents stades
  - [x] Adresse de livraison exposée depuis `reservation.address` (champ ajouté dans la query `api.orders.list`)
  - [x] Bouton "Tout livrer" par groupe client

- [x] **4.2 Bulk marking "livré"**
  - [x] Cases à cocher par commande (non-terminales uniquement)
  - [x] Case à cocher globale (sélectionner tout) + case par groupe client
  - [x] Barre d'action flottante affichée dès qu'une sélection existe
  - [x] Bouton "Marquer comme livré" global + bouton "Tout livrer" par client
  - [x] Mutation `api.orders.bulkUpdateStatus` avec transaction Prisma unique + notifications WhatsApp automatiques

---

## Phase 5 — Contexte conversationnel et handoff
**Objectif : gérer les conversations complexes et le passage à un agent humain**
**Effort : 4–5 jours**
**Dépendances : Phases 1, 2**

- [x] **5.1 Modèle `ConversationState`**
  Table `conversation_states` : `tenantId | phone | handedOff | updatedAt`
  - [x] Écrire la migration Prisma (`prisma/migrations/20260409000000_conversation_state_faq/`)
  - [x] Prisma schema + generate (`ConversationState` model, `faqDelivery/Payment/Location/Availability` sur `Tenant`)
  - [x] Service `src/server/conversation/conversationState.ts` (`getConversationState`, `setHandedOff`)

- [x] **5.2 Handoff vers agent humain**
  - [x] Détecter les mots-clés : "agent", "humain", "appel", "parler à quelqu'un", "conseiller", "service client" (`isHandoffRequest`)
  - [x] Passer `ConversationState.handedOff = true` via `setHandedOff()`
  - [x] Suspendre les réponses automatiques pour ce client tant que `handedOff = true` (return early dans `webhook-processor.ts`)
  - [x] Notifier le client : message `botMsg.client.handedOff()`

- [x] **5.3 FAQ automatique**
  - [x] Détecter mots-clés : livraison, paiement, localisation, disponibilité (`detectFaqIntent`)
  - [x] Répondre avec réponses configurables par tenant (champs `faqDelivery/Payment/Location/Availability` sur `Tenant`)
  - [x] Interface d'édition des réponses FAQ : `/parametres/faq` + `api.settings.getFaqSettings` / `setFaqSettings`

---

## Phase 6 — Améliorations avancées
**Objectif : compléter l'expérience produit**
**Effort : variable**
**Dépendances : Phases 1–5**

- [x] **6.1 Résumé de session post-live**
  À la fermeture d'une session (manuelle via `endLive`), envoyer un résumé au vendeur WhatsApp :
  - [x] Nombre de commandes créées
  - [x] Réservations en attente (non confirmées)
  - [x] Articles non vendus
  - [x] Chiffre d'affaires de la session (`botMsg.seller.liveSummary()` dans `live.ts` `endLive`)

- [x] **6.2 Broadcast waitlist**
  Couvert par TTL job (`reservation-ttl.ts`) et `releaseReservation` dans `live.ts` — les clients en waitlist sont notifiés automatiquement via `botMsg.client.waitlistPromoted()`.

- [ ] **6.3 Classification d'intent par IA**
  En dernier recours (après tous les handlers rule-based), appeler Claude ou OpenAI pour classifier les messages ambigus.
  À implémenter uniquement si le fallback générique s'avère insuffisant en production.

---

## Récapitulatif

| Phase | Action | Effort | Impact | Statut |
|-------|--------|--------|--------|--------|
| 1 | Templates de messages naturels | 1–2 j | Fort | ✅ |
| 2 | Automatisation messages manquants | 2–3 j | Fort | ✅ |
| 3 | Relances et expiration | 2–3 j | Moyen | ✅ |
| 4 | Dashboard vue groupée + bulk | 3–4 j | Fort | ✅ |
| 5 | ConversationState + handoff + FAQ | 4–5 j | Moyen | ✅ |
| 6 | Avancées (résumé, waitlist, IA) | variable | Faible à moyen | ✅ (6.3 différé) |

**Phases 1, 2, 3** → résoudre le problème conversationnel immédiat
**Phase 4** → résoudre le problème opérationnel vendeur
**Phases 5, 6** → compléter et peaufiner
