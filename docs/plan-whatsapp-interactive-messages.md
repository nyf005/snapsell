# Plan : Messages interactifs WhatsApp

## Contexte

Actuellement tous les messages sortants sont du **texte brut**. Le client doit taper "OUI", une adresse, ou un code article à la main. L'API Meta WhatsApp Business supporte des messages interactifs (boutons, listes) qui permettent au client de répondre en **un tap**, réduisant les erreurs et les abandons.

---

## Types de messages interactifs disponibles

### Reply buttons
- Max **3 boutons**
- Idéal pour les confirmations binaires ou ternaires
- Réponse reçue avec `message.type = "interactive"` et `message.interactive.type = "button_reply"`

### List messages
- Max **10 options** dans un menu déroulant
- Idéal pour choisir parmi plusieurs articles, commandes, ou catégories
- Réponse reçue avec `message.interactive.type = "list_reply"`

Les deux fonctionnent **dans la fenêtre 24h** (après le dernier message entrant du client). Pas de pré-approbation Meta requise.

---

## Inventaire des messages existants

### Messages client (buyers)

| ID | Trigger | Attend une réponse | Réponse attendue |
|----|---------|-------------------|-----------------|
| `welcome` | Premier message du client | Oui | Code article (ex: A12) |
| `reserved` | Code valide envoyé | Oui | Adresse de livraison ou autre code |
| `waitlist` | Code valide, stock épuisé | Non | Auto-promu si place se libère |
| `exhausted` | Code valide, aucune liste | Non | — |
| `codeSuggestion` | Faute de frappe détectée | Oui | Code corrigé |
| `codeUnknown` | Code introuvable | Oui | Code corrigé |
| `codeUnknownNoSession` | Code introuvable, pas de live | Non | — |
| `recap` | Adresse fournie | Oui | "OUI" pour confirmer |
| `orderConfirmed` | Commande confirmée (sans acompte) | Non | — |
| `orderWithDeposit` | Commande confirmée (avec acompte) | Oui | Photo preuve de paiement |
| `reminder` | T-2 min avant expiration | Oui | Adresse |
| `reservationExpired` | TTL écoulé | Oui | Renvoi du code |
| `waitlistPromoted` | Place libérée sur liste d'attente | Oui | Adresse de livraison |
| `orderStatus` | Relance client avec commande active | Non | — |
| `orderInDelivery` | Vendeur → statut in_delivery | Non | — |
| `orderDelivered` | Vendeur → statut delivered | Non | — |
| `orderCancelled` | Vendeur → statut cancelled | Non | — |
| `proofApproved` | Vendeur approuve la preuve | Non | — |
| `proofRejected` | Vendeur rejette la preuve | Oui | Nouvelle preuve |
| `fallback` | Message non reconnu | Oui | Code article |
| `handedOff` | Client demande un agent humain | Non | — |

---

## Améliorations par priorité

### Priorité 1 — Fort impact, logique simple

Ces messages attendent un "OUI"/"NON" ou une action évidente. La conversion en boutons est directe.

#### `recap` → Reply buttons
**Avant :**
```
Voici le récap de ta commande 👇
🛍️ Article : A12
💰 Prix : 5 000 FCFA
📍 Adresse : Cocody Angré
💳 Total : 5 000 FCFA

Tout est bon ? Réponds *OUI* pour confirmer ✅
```
**Après :**
```
Voici le récap de ta commande 👇
🛍️ Article : A12 — 5 000 FCFA
📍 Adresse : Cocody Angré

[✅ Confirmer]  [❌ Annuler]  [➕ Ajouter un article]
```
Parsing actuel : détecte le texte "OUI" → remplacer par `button_reply.id = "confirm_order"`.

---

#### `reminder` → Reply buttons
**Avant :**
```
Hey ! 👀 Ta réservation expire dans 2 minutes.
Envoie ton adresse vite pour ne pas la perdre 📍
```
**Après :**
```
Hey ! 👀 Ta réservation expire dans 2 minutes.

[📍 Envoyer mon adresse]  [❌ Annuler la réservation]
```
Le bouton "Envoyer mon adresse" déclenche côté bot le même état que si le client avait dit "j'envoie mon adresse" — le prochain message texte est traité comme une adresse.

---

#### `reservationExpired` → Reply buttons
**Avant :**
```
Ta réservation pour *A12* a malheureusement expiré ⏰
Si l'article est encore disponible, renvoie simplement le code *A12* pour recommencer 💪
```
**Après :**
```
Ta réservation pour *A12* a expiré ⏰

[🔄 Recommencer avec A12]  [❌ Abandonner]
```
Payload du bouton : `{ id: "retry_code", payload: "A12" }` → traité comme si le client avait renvoyé le code.

---

#### `proofRejected` → Reply buttons
**Avant :**
```
Oops, ta preuve d'acompte pour SS-0042 n'a pas pu être validée 😕
Renvoie une nouvelle preuve ou contacte-nous directement.
```
**Après :**
```
Oops, ta preuve pour SS-0042 n'a pas pu être validée 😕

[📸 Renvoyer une preuve]  [👤 Parler à un agent]
```
Le bouton "Renvoyer une preuve" met le client en état `awaiting_proof` → le prochain message image est traité comme une preuve.

---

### Priorité 2 — Impact moyen, refactor modéré

#### `codeSuggestion` → Reply buttons
**Avant :**
```
Je n'ai pas trouvé ce code. Tu voulais dire *A12* ? Renvoie-le moi 😊
```
**Après :**
```
Je n'ai pas trouvé ce code. Tu voulais dire *A12* ?

[✅ Oui, c'est A12]  [❌ Non, autre code]
```
Bouton "Oui" → traité comme si le client avait envoyé "A12".

---

#### `welcome` → List message (si live en cours)
**Avant :**
```
Bonjour ! 👋 Bienvenue chez *Boutique ABC*.
Tu as vu un article qui t'intéresse lors du live ? Envoie-moi son code (ex : A12)
```
**Après (si live actif avec articles) :**
```
Bonjour ! 👋 Bienvenue chez *Boutique ABC*.
Voici les articles disponibles en ce moment :

> Voir les articles ▾
  A12 — Robe rouge (5 000 FCFA)
  B04 — Sac cuir (12 000 FCFA)
  C07 — Sandales (3 500 FCFA)
```
Si pas de live actif → texte brut inchangé.

---

#### `fallback` → Reply buttons
**Avant :**
```
Je n'ai pas bien compris 😅
Envoie-moi le code de l'article que tu veux (ex : A12)
```
**Après :**
```
Je n'ai pas bien compris 😅

[🛍️ Voir les articles]  [👤 Parler à un agent]
```

---

#### `orderWithDeposit` → Reply buttons
**Avant :**
```
Super ! Ta commande est enregistrée 🎉
Pour finaliser, on a besoin d'un acompte. Envoie la preuve de paiement ici dans les 15 min 📸
```
**Après :**
```
Super ! Ta commande est enregistrée 🎉
Pour finaliser, envoie la preuve de paiement dans les 15 min.

[📸 Envoyer ma preuve]  [👤 Parler à un agent]
```
Le bouton "Envoyer ma preuve" met le client en état `awaiting_proof`.

---

### Priorité 3 — Nice to have

| Message | Amélioration |
|---------|-------------|
| `orderConfirmed` | Bouton [📦 Suivre ma commande] → déclenche `orderStatus` |
| `waitlistPromoted` | Boutons [📍 Envoyer mon adresse] [❌ Je ne veux plus] |
| `proofApproved` | Bouton [📦 Suivre ma commande] |

---

### Messages qui ne changent pas

Notifications pures sans attente de réponse — texte brut suffisant :

- `exhausted`, `waitlist`, `codeUnknownNoSession`
- `orderStatus`, `orderInDelivery`, `orderDelivered`, `orderCancelled`
- `handedOff`

---

## Architecture technique

### 1. Nouveau type `OutboundMessage`

Étendre le type actuel pour supporter un payload optionnel de boutons :

```typescript
// src/server/messaging/types.ts
type InteractiveButton = {
  id: string;       // payload reçu dans le webhook (ex: "confirm_order")
  title: string;    // texte affiché (max 20 chars)
};

type OutboundMessage =
  | { kind: "text"; tenantId: string; to: string; body: string; correlationId: string; mediaUrl?: string }
  | { kind: "buttons"; tenantId: string; to: string; body: string; buttons: InteractiveButton[]; correlationId: string }
  | { kind: "list"; tenantId: string; to: string; body: string; buttonLabel: string; items: { id: string; title: string; description?: string }[]; correlationId: string };
```

### 2. Adapter `writeToOutbox`

Sérialiser le payload interactif dans le champ `body` (JSON) ou ajouter une colonne `payload` sur `MessageOut`.

> Option recommandée : ajouter `interactivePayload Json?` sur `MessageOut` en Prisma.

### 3. Adapter l'envoi Meta (`outbox-sender`)

L'endpoint `/api/qstash/outbox-send` construit le body de l'appel Meta. Il faut brancher la construction du payload interactif selon `message.kind`.

Exemple payload Meta pour reply buttons :
```json
{
  "messaging_product": "whatsapp",
  "to": "+2250709542783",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": { "text": "Voici le récap..." },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "confirm_order", "title": "✅ Confirmer" } },
        { "type": "reply", "reply": { "id": "cancel_order", "title": "❌ Annuler" } }
      ]
    }
  }
}
```

### 4. Adapter la réception (`webhook-processor`)

Ajouter la détection `message.type === "interactive"` :

```typescript
if (message.type === "interactive") {
  const buttonId = message.interactive?.button_reply?.id
                ?? message.interactive?.list_reply?.id;
  // Router vers le bon handler selon buttonId
}
```

Mapping bouton → comportement :

| `button_reply.id` | Comportement |
|-------------------|-------------|
| `confirm_order` | Identique à recevoir "OUI" en état recap |
| `cancel_order` | Annuler la réservation |
| `add_item` | Passer en état "attente nouveau code" |
| `retry_code:{code}` | Traiter le code comme un nouveau message article |
| `send_proof` | Passer en état `awaiting_proof` |
| `contact_agent` | Déclencher `handedOff` |
| `track_order` | Envoyer `orderStatus` |

### 5. Nouvelles fonctions dans `templates.ts`

Créer un namespace `botMsg.client.interactive.*` avec les fonctions retournant un `OutboundMessage` de type `buttons` ou `list`.

---

## Plan d'exécution

| Étape | Fichiers | Dépendances |
|-------|----------|-------------|
| **1.** Ajouter `interactivePayload Json?` sur `MessageOut` (migration Prisma) | `schema.prisma` | — |
| **2.** Étendre `OutboundMessage` avec les kinds `buttons` et `list` | `types.ts` | Étape 1 |
| **3.** Adapter `writeToOutbox` pour sérialiser le payload | `outbox.ts` | Étape 2 |
| **4.** Adapter `outbox-sender` pour construire le body Meta interactif | `outbox-send/route.ts` | Étape 3 |
| **5.** Adapter `webhook-processor` pour détecter et router les `interactive` | `webhook-processor.ts` | Étape 4 |
| **6.** Implémenter Priorité 1 : `recap`, `reminder`, `reservationExpired`, `proofRejected` | `templates.ts` + appelants | Étape 5 |
| **7.** Implémenter Priorité 2 : `codeSuggestion`, `welcome`, `fallback`, `orderWithDeposit` | `templates.ts` + appelants | Étape 6 |
| **8.** Implémenter Priorité 3 : `orderConfirmed`, `waitlistPromoted`, `proofApproved` | `templates.ts` + appelants | Étape 7 |

---

## Risques et points d'attention

- **Limite de titre bouton : 20 caractères** — les labels doivent être courts
- **Limite list message : 10 options** — si le live a >10 articles, tronquer ou paginer
- **Compatibilité WhatsApp Web** — les messages interactifs s'affichent bien sur mobile, l'aperçu Web peut varier
- **Branding** — la signature `_Propulsé par SnapSell_` devra être ajoutée dans le champ `footer` des messages interactifs (Meta supporte un champ `footer.text`)
- **Tests** — le webhook-processor doit continuer à gérer les réponses texte brut (certains clients peuvent taper "OUI" manuellement même quand des boutons sont proposés)
