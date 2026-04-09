# Roadmap — Automatisation des conversations WhatsApp

## Contexte

SnapSell dispose déjà d'un flow conversationnel partiel et fonctionnel :

```
Client → code produit → réservation → adresse → OUI → commande
```

Ce qui manque, c'est la couche d'automatisation qui gère **tout ce qui est en dehors de ce flow** : accueil, messages non reconnus, relances, suivi post-commande.

---

## État actuel du flow

| Étape | Automatisé ? |
|-------|-------------|
| Client envoie un code produit → réservation | Oui |
| Client envoie une adresse → récap | Oui |
| Client envoie "OUI" → commande créée | Oui |
| Opt-out (STOP) | Oui |
| Détection vendeur vs client | Oui |
| Vendeur envoie code → LiveItem créé | Oui |
| Vendeur envoie photo → liée au dernier code | Oui |
| Message d'accueil premier contact | **Non** |
| Messages hors-flow ignorés silencieusement | **Non** |
| Reminder avant expiration réservation | **Non** |
| Réponse automatique post-commande | **Non** |
| Gestion multi-tours (contexte conversation) | **Non** |

---

## Commandes multi-articles

### V1 — Flow séquentiel (approche retenue)

Un client peut commander plusieurs articles dans le même numéro WhatsApp, mais **un à la fois**. Il finalise le premier article (adresse + OUI) avant de pouvoir en réserver un autre.

```
Client envoie "A12" → réservé → adresse → OUI → commande A12 confirmée
Client envoie "B7"  → réservé → adresse → OUI → commande B7 confirmée
Client envoie "C3"  → réservé → ...
```

Le bot guide clairement après chaque réservation :
```
"A12 réservé ✅ Envoie ton adresse.
Tu pourras ajouter d'autres articles juste après !"
```

**Pourquoi ce choix :**
- La contrainte DB actuelle (1 réservation active par client) est conservée
- Correspond au comportement naturel WhatsApp — les clients réagissent aux réponses, ils n'envoient pas 5 codes en rafale
- Pas besoin de XState ni de refonte du modèle de données
- Facile à expliquer au client dans le message de confirmation

### V2 — Panier parallèle (fonctionnalité future)

Le client envoie plusieurs codes en rafale (`A12`, `B7`, `C3`), le système les groupe dans une commande unique avec une seule adresse et une seule confirmation.

Ce que ça implique :
- Modifier le modèle `Reservation` pour autoriser plusieurs actives par client simultanément
- Définir un mécanisme de fermeture du panier (timeout inactivité, mot-clé "c'est tout", ou commande explicite)
- Une adresse unique pour tous les articles du panier
- "OUI" confirme tout le panier d'un coup
- XState devient pertinent ici (états parallèles, flow non-linéaire)

**À implémenter uniquement si les retours clients montrent que le flow séquentiel est un frein.**

### Dashboard — Vue groupée par client

Même en V1 séquentiel, les commandes d'un même client doivent être **regroupées dans le dashboard** pour que le vendeur puisse préparer un seul colis par client.

Comportement attendu :
```
Client +225 07 XX XX XX
  ├── A12 — Sac noir — 10 000 FCFA   ✅ confirmé
  ├── B7  — Robe rouge — 15 000 FCFA ✅ confirmé
  └── C3  — Ceinture — 5 000 FCFA    ✅ confirmé
  ─────────────────────────────────────────────
  Total : 30 000 FCFA | Adresse : Cocody Angré
```

Ce que ça implique côté dashboard :
- Regrouper les `Order` par `clientPhone` dans la vue liste
- Afficher le total cumulé par client
- Afficher l'adresse commune (la dernière fournie, ou détecter si elle change entre articles)
- Action groupée : marquer toutes les commandes d'un client comme livrées en un clic
- Indication visuelle si un client a des commandes à des statuts différents (ex: une confirmée, une en attente de dépôt)

---

## Ce qui reste à faire

### Priorité 1 — Gains immédiats (faible effort, fort impact)

#### 1.1 Message d'accueil automatique
- Détecter le premier contact d'un client (aucun `MessageIn` précédent pour ce numéro + tenant)
- Répondre automatiquement avec un message de bienvenue + guide
- Exemple : `"Bienvenue ! Envoie le code produit vu lors du live (ex: A12) pour réserver."`
- Fichier concerné : `src/server/workers/webhook-processor.ts`

#### 1.2 Fallback pour messages non reconnus
- Actuellement : tout message non reconnu est ignoré (pas de réponse)
- Ajouter un handler de fallback en fin de routing
- Répondre avec un message guide : `"Je n'ai pas compris. Envoie un code produit (ex: A12) pour réserver."`
- Couvrir les cas : "Bonjour", "C'est dispo ?", "Prix ?", "Photo ?", etc.

#### 1.3 Message d'erreur pour code introuvable sans session active
- Actuellement : erreur technique si code inconnu et pas de session active
- Ajouter un message clair : `"Ce code est introuvable. Vérifie le code vu lors du live."`

---

### Priorité 2 — Relances et suivi (effort moyen)

#### 2.1 Reminder avant expiration de réservation
- Le champ `reminderSentAt` existe dans le modèle `Reservation` mais n'est jamais utilisé
- Implémenter un job cron qui tourne toutes les 2 minutes
- Logique : trouver les réservations avec `expiresAt < now + 2min` et `reminderSentAt = null`
- Envoyer : `"Ta réservation A12 expire dans 2 minutes. Envoie ton adresse pour confirmer."`
- Mettre à jour `reminderSentAt`
- Fichier à créer : job cron dans le worker Railway

#### 2.2 Message d'expiration de réservation
- Quand une réservation expire (status → `expired`), envoyer un message au client
- Exemple : `"Ta réservation A12 a expiré. Envoie à nouveau le code pour réserver si disponible."`
- Déclenché par le job de cleanup des réservations existant

#### 2.3 Réponse automatique post-commande
- Quand un client écrit après que sa commande est confirmée (status: `confirmed`)
- Répondre avec le statut de sa commande : `"Ta commande SS-0001 est en cours. On te contacte pour la livraison."`
- Évite les "c'est bon ?", "vous avez reçu ?" manuels

---

### Priorité 3 — Contexte conversationnel (effort élevé)

#### 3.1 Modèle `ConversationState`
- Nouvelle table Prisma pour tracker l'état d'une conversation au-delà de `Reservation.status`
- Champs minimaux : `tenantId`, `phone`, `state`, `currentItemCode`, `updatedAt`, `expiresAt`
- États possibles : `idle`, `awaiting_code`, `awaiting_address`, `awaiting_confirmation`, `handed_off`
- Permet de gérer des flows multi-tours sans dépendre uniquement du statut de réservation

#### 3.2 Gestion du handoff vers agent humain
- Détecter les mots-clés : "agent", "humain", "appel", "parler à quelqu'un"
- Passer l'état en `handed_off`
- Notifier l'agent via le dashboard existant
- Suspendre les réponses automatiques tant que `handed_off = true`
- Permettre à l'agent de reprendre le contrôle depuis le dashboard

#### 3.3 FAQ automatique
- Répondre automatiquement aux questions fréquentes détectées par mots-clés
- Questions à couvrir :
  - Livraison → zones + délais configurés dans le tenant
  - Paiement → méthodes acceptées
  - Localisation → adresse du vendeur
  - Disponibilité → "Envoie le code pour vérifier"
- Les réponses doivent être configurables par tenant (pas hardcodées)

---

### Priorité 4 — Améliorations avancées (effort élevé)

#### 4.1 Classification d'intent par IA
- Pour les messages ambigus que les regex ne capturent pas
- Appel Claude/OpenAI uniquement en fallback (après règles rule-based)
- Classifier : product_code | order_intent | faq | human_request | unknown
- Ne pas remplacer les règles existantes, juste compléter

#### 4.2 Broadcast et relance catalogue
- Notifier les clients en waitlist quand un item se libère
- Notifier les clients intéressés par une catégorie quand un nouveau lot arrive
- S'appuyer sur le modèle `Waitlist` existant

#### 4.3 Bulk marking des commandes comme livrées
- Actuellement : le vendeur doit changer le statut commande par commande
- Ajouter une action groupée dans le dashboard : sélectionner N commandes → "Marquer comme livré"
- Interface : cases à cocher sur la liste des commandes + bouton d'action en masse
- Filtre utile : toutes les commandes `in_delivery` d'une même session ou d'une même date
- Mise à jour en transaction unique pour éviter les états partiels

#### 4.4 Résumé de session post-live
- En fin de session live (auto-close), envoyer un résumé au vendeur
- Contenu : commandes créées, réservations en attente, items non vendus
- Via le dashboard ou WhatsApp vendeur

---

## Ton de voix et messages naturels

### Problème actuel

Les messages actuels sont fonctionnels mais froids et mécaniques :

```
"Réservé. Envoie ton adresse."
"Récap: A12 — 5000 FCFA. Réponds OUI..."
"Commande confirmée. Merci!"
```

Ils ressemblent à un robot, pas à une vraie boutique. Sur WhatsApp, les clients s'attendent à une expérience proche d'une vraie conversation — surtout après avoir vu un live TikTok chaleureux.

---

### Principes à respecter

- **Court** — WhatsApp n'est pas un email. Pas de phrases trop longues.
- **Chaleureux** — comme si c'était une personne réelle de la boutique qui écrit.
- **Clair** — l'action attendue du client doit toujours être évidente.
- **Cohérent** — le même ton partout, pas un mélange formel/informel.
- **Adapté au marché** — formulations naturelles en français ivoirien/africain si nécessaire.

---

### Refonte des messages existants

#### Réservation confirmée
Avant :
```
"Réservé. Envoie ton adresse."
```
Après :
```
"Super choix ! 🎉 L'article A12 est réservé pour toi.

Envoie-moi ton adresse de livraison stp 📍"
```

#### Récapitulatif avant confirmation
Avant :
```
"Récap: A12 — 5000 FCFA. Réponds OUI..."
```
Après :
```
"Parfait ! Voici le récap de ta commande 👇

🛍️ Article : A12
💰 Prix : 5 000 FCFA
📍 Adresse : [adresse du client]

Tout est bon ? Réponds OUI pour confirmer ✅"
```

#### Commande confirmée
Avant :
```
"Commande confirmée. Merci!"
```
Après :
```
"C'est validé ! 🙌 Ta commande est bien enregistrée.

On te recontacte très vite pour les détails de livraison. Merci de nous faire confiance 💛"
```

#### Premier contact / accueil
```
"Bonjour ! 👋 Bienvenue chez [nom de la boutique].

Tu as vu un article qui t'intéresse lors du live ? Envoie-moi son code (ex : A12) et je m'occupe de toi 😊"
```

#### Article non disponible
Avant :
```
"Épuisé."
```
Après :
```
"Oh non, l'article A12 vient d'être épuisé 😔

Je t'ajoute en liste d'attente. Si un article se libère ou qu'on en reçoit d'autres, tu seras la première informée ! 🔔"
```

#### Reminder avant expiration
Avant :
```
"Ta réservation A12 expire dans 2 minutes."
```
Après :
```
"Hey ! 👀 Ta réservation pour l'article A12 expire dans 2 minutes.

Envoie ton adresse vite pour ne pas le perdre 📍"
```

#### Réservation expirée
Avant :
```
"Ta réservation A12 a expiré."
```
Après :
```
"Ta réservation pour A12 a malheureusement expiré ⏰

Si l'article est encore disponible, renvoie simplement le code A12 pour recommencer 💪"
```

#### Message non reconnu (fallback)
```
"Je n'ai pas bien compris 😅

Envoie-moi le code de l'article que tu veux (ex : A12) et je m'occupe du reste !"
```

#### Confirmation de commande avec dépôt requis
```
"Super ! Ta commande est enregistrée 🎉

Pour finaliser, on a besoin d'un acompte. Envoie la preuve de paiement ici dès que c'est bon 📸

On garde ton article de côté en attendant 🔒"
```

---

### Implémentation recommandée

Ne pas hardcoder les messages directement dans le code métier. Créer un fichier de templates centralisé :

```
src/server/messaging/templates.ts
```

Chaque message est une fonction qui prend les variables nécessaires :

```typescript
// Exemple de structure
export const templates = {
  reservation: {
    confirmed: (code: string) => `Super choix ! 🎉 L'article ${code} est réservé pour toi.\n\nEnvoie-moi ton adresse de livraison stp 📍`,
    recap: (code: string, price: string, address: string) => `...`,
    expired: (code: string) => `...`,
    reminder: (code: string) => `...`,
  },
  order: {
    confirmed: () => `...`,
    confirmWithDeposit: () => `...`,
  },
  welcome: () => `...`,
  fallback: () => `...`,
  unavailable: (code: string, position: number) => `...`,
}
```

Avantages :
- Tous les messages au même endroit, facile à modifier
- Possibilité future de les rendre configurables par tenant (chaque boutique son propre ton)
- Facilite la traduction ou l'adaptation par marché

---

## Architecture recommandée

Ne pas utiliser de service externe (n8n, Botpress, etc.).

Tout construire dans l'infrastructure existante :

```
MessageIn reçu
  ↓
webhook-processor.ts (Railway worker)
  ↓
[Nouveau] ConversationRouter
  ├── Reservation active ? → continuer flow existant
  ├── Code produit ? → flow réservation existant
  ├── Mot-clé FAQ ? → réponse template
  ├── Mot-clé handoff ? → handed_off + notif agent
  ├── Premier contact ? → message d'accueil
  └── Fallback → message guide
  ↓
writeToOutbox() → MessageOut → outbox-sender → WhatsApp
```

**Stack recommandée pour le state machine :** XState (librairie JS/TS de state machine) ou implémentation custom simple selon complexité finale.

---

## Notes techniques

- Le champ `reminderSentAt` sur `Reservation` est déjà dans le schéma, pas besoin de migration pour la Priorité 2.1
- L'outbox pattern existant gère déjà les retries et la fiabilité d'envoi — ne pas le contourner
- Toute réponse automatique doit passer par `writeToOutbox()` pour rester dans le système de trace
- Les réponses doivent respecter la fenêtre de 24h Meta (messages initiés hors-fenêtre = template obligatoire)
- Multi-tenant natif : toute logique doit être scopée par `tenantId`
