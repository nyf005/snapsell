# Plan d'intégration WhatsApp Business — SnapSell

> Date : 2026-04-14  
> Auteur : Fabrice N'DRI  
> Statut : En cours d'implémentation

---

## Contexte

SnapSell gère aujourd'hui les conversations WhatsApp de ses clients via un bot construit sur la Meta Cloud API. Le bot couvre : intent client (achat, FAQ, handoff), gestion de réservations, collecte d'adresse, sélection de variantes, et création de catalogue via WhatsApp vendeur.

L'objectif de ce plan est d'aligner l'app avec les fonctionnalités natives de WhatsApp Business pour améliorer l'expérience client, augmenter la conversion, et professionnaliser les boutiques des vendeurs.

---

## Vue d'ensemble des 5 priorités

```
P2 (Catalogue Meta)
  └─→ P3 (Messages produit)     ← bloc "vitrine"

P1 (Panier natif)               ← ROI immédiat, indépendant

P5 (Statuts read/delivered)     ← rapide, peu de risque

P4 (WhatsApp Flows)             ← le plus complexe, le plus impactant
```

---

## Prérequis transverse — Plan C : Enrichissement catalogue (P2)

Avant toute synchro avec Meta, le modèle `CatalogueItem` doit être enrichi.

### Pourquoi

Le catalogue Meta exige `name` et `image_url` comme champs obligatoires. Aujourd'hui un article créé via WhatsApp vendeur n'a qu'un `code` et un `amount` — pas de nom, pas toujours d'image.

### Principe

Le flux WhatsApp vendeur reste **identique**. La synchro Meta est un **enrichissement volontaire** depuis le dashboard.

### Migration DB — CatalogueItem

```prisma
model CatalogueItem {
  // champs existants...
  name           String?   // Nouveau — nom lisible du produit
  metaProductId  String?   // ID retourné par Meta Commerce Manager
  syncedToMeta   Boolean   @default(false)
  metaSyncedAt   DateTime? // Dernière synchro réussie
}
```

### Migration DB — Tenant

```prisma
model Tenant {
  // champs existants...
  metaCatalogId       String?  // ID du catalogue Meta Commerce Manager
  businessHoursStart  String?  // ex: "08:00"
  businessHoursEnd    String?  // ex: "20:00"
  businessTimezone    String?  // ex: "Africa/Abidjan"
  awayMessage         String?  // Message personnalisé hors horaires
}
```

### Migration DB — MessageOut statuts

`MessageOut.status` est un `String` libre. Nouveaux statuts documentés :
- `delivered` — livré sur le téléphone du destinataire
- `read` — lu par le destinataire

### Règle de synchro

Un article est éligible à la synchro Meta si :
- `name` est renseigné (non null)
- `mediaStorageKey` est renseigné (image présente)
- `availableQty > 0`

Les articles sans nom ou sans image restent dans le catalogue interne uniquement.

### Variables d'environnement à ajouter

```bash
# Activer la synchro catalogue Meta (désactivé par défaut)
META_CATALOG_SYNC_ENABLED=true
```

### Entitlement recommandé

La synchro Meta est une fonctionnalité **Pro/Starter** uniquement. Ajouter un flag :
```prisma
hasMetaCatalogSync Boolean @default(false) @map("has_meta_catalog_sync")
```

---

## P1 — Panier WA natif (messages `order`)

### Valeur
Le client peut ajouter plusieurs articles depuis le catalogue Meta et envoyer une commande structurée en un seul message, sans taper de codes manuellement.

### Ce qui change

**Webhook entrant** — nouveau type de message à gérer dans [`webhook-processor.ts`](../src/server/workers/webhook-processor.ts) :

```typescript
// Payload Meta d'un message "order"
{
  type: "order",
  order: {
    catalog_id: "...",
    product_items: [
      { product_retailer_id: "A12", quantity: 2, item_price: 5000, currency: "XOF" },
      { product_retailer_id: "B7",  quantity: 1, item_price: 3000, currency: "XOF" }
    ]
  }
}
```

**Logique à implémenter** :
1. Détecter `message.type === "order"` dans le webhook-processor
2. Pour chaque `product_item` : appeler `findOrCreateOrderableItemByCode()` + créer une réservation
3. Envoyer un récap interactif avec les N articles réservés
4. En cas de rupture partielle : réserver ce qui est dispo, notifier les articles épuisés

**Schéma de validation Zod** à ajouter dans l'adapter :
```typescript
const metaOrderItemSchema = z.object({
  product_retailer_id: z.string(),
  quantity: z.number().int().positive(),
  item_price: z.number(),
  currency: z.string(),
});
const metaOrderSchema = z.object({
  catalog_id: z.string(),
  product_items: z.array(metaOrderItemSchema).min(1),
});
```

**Crédits** : Un message `order` avec N articles consomme **1 crédit** (pas N), car c'est une seule interaction client.

**Limites WA** :
- Disponible seulement si le catalogue Meta est actif (dépend de P2)
- Le panier est disponible uniquement sur les téléphones avec WA à jour

### Gestion des erreurs Meta API

- **429 Rate Limited** : retry exponentiel, max 3 tentatives
- **400 Invalid product** : article non trouvé dans le catalogue Meta → notifier le vendeur
- **Catalogue désactivé** : fallback vers texte brut

### Fichiers impactés
- `src/server/workers/webhook-processor.ts` — ajout branche `order`
- `src/server/messaging/templates.ts` — nouveau template récap multi-articles
- `src/server/reservation/service.ts` — réservation en batch
- `src/server/messaging/providers/meta/adapter.ts` — schéma validation `order`

### Tests à écrire
- `order` avec tous les articles en stock → toutes réservations créées
- `order` avec rupture partielle → réservations partielles + message d'information
- `order` avec tous articles épuisés → aucune réservation + message épuisé
- `order` avec code inconnu → fallback `codeUnknown`

---

## P2 — Synchronisation catalogue Meta

### Valeur
Les articles enrichis (nom + image) apparaissent dans le catalogue WA de la boutique, visibles depuis le profil Business du vendeur.

### Architecture

```
Dashboard vendeur
  └─ Ajoute nom + image sur un article
        └─ Mutation tRPC catalogue.syncToMeta()
              └─ POST /v21.0/{catalog-id}/products (Meta Commerce API)
                    └─ Stocke metaProductId + syncedToMeta = true
```

### Implémentation

**Nouveau service** : `src/server/catalogue/syncCatalogueItemToMeta.ts`

```typescript
export async function syncCatalogueItemToMeta(
  tenantId: string,
  catalogueItemId: string
): Promise<{ success: boolean; metaProductId?: string; reason?: string }>
```

**Appel Meta Commerce API** :
```
POST https://graph.facebook.com/v21.0/{catalog-id}/products
{
  "retailer_id": "A12",
  "name": "Robe fleurie taille M",
  "price": 500000,              // en centimes
  "currency": "XOF",
  "availability": "in stock",
  "image_url": "https://cdn.snapsell.../signed-url",
  "description": "..."
}
```

**Mise à jour stock** : PATCH quand `availableQty` change (job cron ou hook post-réservation).

**Synchro delta** : Job cron `cron-meta-catalogue-sync` toutes les heures pour synchroniser les articles `syncedToMeta = false` éligibles.

**Désynchronisation** :
- `availableQty = 0` → PATCH `availability: "out of stock"`
- Article supprimé → DELETE `/v21.0/{product-id}`

### Gestion des erreurs Meta Commerce API

| Erreur | Action |
|--------|--------|
| `400 Invalid image_url` | Régénérer la signed URL R2 et réessayer |
| `400 Missing required field` | Logger + marquer `syncedToMeta = false` avec raison |
| `429 Rate Limited` | Retry exponentiel (max 3x), puis DLQ |
| `401 Unauthorized` | Alerter vendeur — token Meta expiré |
| `403 Catalog not found` | Invalider `metaCatalogId` + alerter |

### Entitlement

La synchro Meta nécessite `tenant.hasMetaCatalogSync === true` (plan Starter/Pro).
Si non activé, la mutation tRPC retourne une erreur `FORBIDDEN` avec message "Disponible à partir du plan Starter".

### Fichiers impactés
- `prisma/schema.prisma` — champs `CatalogueItem` + `Tenant`
- `src/server/catalogue/syncCatalogueItemToMeta.ts` — nouveau
- `src/server/api/routers/catalogue.ts` — mutation `syncToMeta`
- `src/server/workers/queues.ts` — nouveau job cron

### Tests à écrire
- Synchro réussie → `metaProductId` stocké, `syncedToMeta = true`
- Article sans nom → retour `reason: "missing_name"`
- Article sans image → retour `reason: "missing_image"`
- Erreur 429 Meta → retry + échec gracieux
- Tenant sans `metaCatalogId` → retour `reason: "no_catalog_configured"`
- Tenant sans entitlement → erreur FORBIDDEN

---

## P3 — Messages produit (product / multi-product)

### Valeur
Au lieu de recevoir `"A12 - 5000 FCFA"` en texte brut, le client voit une fiche produit cliquable avec photo, nom, prix directement dans WA.

### Types de messages Meta utilisés

**Message produit unique** :
```json
{
  "type": "interactive",
  "interactive": {
    "type": "product",
    "body": { "text": "Voici l'article que vous avez demandé" },
    "action": {
      "catalog_id": "{{catalogId}}",
      "product_retailer_id": "A12"
    }
  }
}
```

**Message multi-produits** (`product_list`) :
- Jusqu'à 30 articles groupés en sections
- Idéal pour les réponses FAQ "qu'est-ce que vous avez en stock ?"

### Quand les utiliser

| Situation actuelle | Nouveau comportement |
|---|---|
| Client demande `A12` → texte avec prix | → fiche produit interactive si `syncedToMeta = true` |
| Client demande "qu'avez-vous ?" | → message multi-produits avec articles dispo |
| Récap de réservation | → garder le format actuel (produit déjà réservé) |

**Fallback** : Si `syncedToMeta = false`, conserver le comportement texte actuel. Aucune régression.

### Fichiers impactés
- `src/server/messaging/templates.ts` — nouveaux templates `productCard()`, `productList()`
- `src/server/messaging/providers/meta/adapter.ts` — support `type: product` dans `send()`
- `src/server/workers/webhook-processor.ts` — utiliser `productCard` si article syncé

---

## P4 — WhatsApp Flows (adresse + variantes)

### Valeur
Remplace les échanges multi-messages pour la collecte d'adresse et la sélection de variantes par des **formulaires natifs** dans WA.

### Cas d'usage 1 : Collecte d'adresse

**Aujourd'hui** : Le bot envoie "Donnez-moi votre adresse" → l'IA extrait les composants du texte libre.

**Avec Flows** : Un formulaire s'ouvre avec `Ville`, `Commune`, `Quartier`, `Détails`.

**Webhook retour** : Meta envoie `interactive.type = "nfm_reply"` avec données structurées.

### Cas d'usage 2 : Sélection de variantes

Un seul formulaire avec `Dropdown` pour chaque dimension, au lieu de N questions séquentielles.

### Impact sur l'IA

`extractAddressComponents()` devient un **fallback** si le Flow n'est pas utilisé. L'IA reste utile pour les clients qui écrivent leur adresse en texte libre.

### Fichiers impactés
- `src/server/workers/webhook-processor.ts` — détecter `nfm_reply`
- `src/server/conversation/variantSelection.ts` — flow optionnel
- `src/server/messaging/providers/meta/adapter.ts` — support envoi de Flows
- Nouveau : `src/server/flows/address.json` et `variant.json`

---

## P5 — Statuts de livraison (delivered / read)

### Valeur
Savoir si un message a été lu avant de relancer. Évite les relances intempestives.

### Ce qui arrive aujourd'hui

Les payloads `statuses` du webhook Meta sont parsés mais ignorés.

### Implémentation

1. `parseInboundBatch()` : extraire les statuts et les retourner séparément
2. Webhook-processor : mettre à jour `MessageOut.status` → `delivered` / `read`
3. Relance réservation : ne pas relancer si `status = read` récent (< 5 min)

**Nouveaux statuts documentés** dans `MessageOut.status` :
```
pending | sent | delivered | read | failed | blocked
```

### Fichiers impactés
- `src/server/messaging/providers/meta/adapter.ts` — extraction statuts
- `src/server/workers/webhook-processor.ts` — mise à jour statuts
- `src/server/workers/reservation-ttl.ts` — relance conditionnelle

---

## Away Message — Automatic Reply hors horaires

### Valeur
Reproduit l'Away Message natif de WA Business, avec en plus la possibilité d'envoyer des boutons interactifs.

### Logique

1. Config tenant : `businessHoursStart`, `businessHoursEnd`, `businessTimezone`, `awayMessage`
2. Webhook-processor : vérifier l'heure avant traitement
3. Si hors horaires ET premier message du client depuis > 1h : envoyer away message
4. Le bot continue de traiter normalement (ou non, selon config)

### Template

```typescript
awayMessageInteractive(awayText: string): OutboundMessage
// Boutons : "Voir le catalogue" | "Laisser un message"
```

### Fichiers impactés
- `prisma/schema.prisma` — champs `Tenant` (businessHours, awayMessage)
- `src/server/workers/webhook-processor.ts` — vérification horaires
- `src/server/messaging/templates.ts` — `awayMessageInteractive()`

---

## Le rôle de l'IA dans ce nouveau contexte

### Fonctions actuelles — toutes conservées

| Fonction | Toujours utile ? | Évolution |
|---|---|---|
| Classification d'intent (BUY/FAQ/HUMAN_AGENT/SELLER_CREATE/OTHER) | **Oui — encore plus utile** | Ajouter `PRODUCT_SEARCH`, `RETURN` |
| Extraction de code produit depuis texte libre | **Oui** | Inchangé |
| Extraction de catégorie FAQ | **Oui** | Inchangé |
| Extraction d'adresse depuis texte libre | **Partiel** | Devient fallback après P4 Flows |

### Nouveaux intents à terme

```typescript
const aiIntentSchema = z.enum([
  "BUY",
  "FAQ",
  "HUMAN_AGENT",
  "SELLER_CREATE",
  "RETURN",          // retour/remboursement
  "PRODUCT_SEARCH",  // "vous avez quoi comme robes ?"
  "OTHER",
]);
```

### Interaction avec le catalogue natif

Avec P2/P3, les clients peuvent parler d'un article par son **nom** ("la robe fleurie") plutôt que son code. L'IA sera nécessaire pour faire le matching nom → `retailer_id`.

---

## Variables d'environnement — récapitulatif complet

| Variable | Obligatoire | Description |
|---|---|---|
| `META_APP_ID` | Oui (prod) | ID app Meta |
| `META_APP_SECRET` | Oui (prod) | Secret webhook HMAC |
| `META_VERIFY_TOKEN` | Oui (prod) | Token challenge webhook |
| `META_CATALOG_SYNC_ENABLED` | Non | Activer la synchro catalogue (default: false) |

Les credentials Meta Commerce API (`metaAccessToken`, `metaCatalogId`) sont **par tenant** dans la DB, pas en variable globale.

---

## Ordre d'implémentation — avec statuts

### Phase 1 — Fondations DB + Env
- [x] Migration DB : `CatalogueItem` + `Tenant` nouveaux champs
- [x] `env.js` : variable `META_CATALOG_SYNC_ENABLED`

### Phase 2 — Catalogue et vitrine
- [x] `syncCatalogueItemToMeta.ts` — service de synchro
- [x] Router tRPC `catalogue.syncToMeta`
- [x] Job cron `cron-meta-catalogue-sync` dans `queues.ts`
- [x] Templates `productCard()` et `productList()`
- [x] Adapter Meta : support `type: product` dans `send()`
- [ ] Webhook-processor : utiliser `productCard` si article syncé (P3 — après dashboard)

### Phase 3 — Commandes et statuts
- [x] Webhook-processor : détecter et traiter `message.type === "order"`
- [x] Templates : récap multi-articles `orderSummaryInteractive()`
- [x] Tracking statuts `delivered` / `read` dans `MessageOut`
- [x] Adapter : extraction statuts webhook Meta

### Phase 4 — Away message
- [x] Schema : `businessHoursStart`, `businessHoursEnd`, `businessTimezone`, `awayMessage`
- [x] Webhook-processor : vérification horaires + away message
- [x] Templates : `awayMessageInteractive()`

### Phase 5 — WhatsApp Flows (UX avancée)
- [ ] Définitions JSON des Flows (adresse + variantes)
- [ ] Adapter : support envoi de Flows
- [ ] Webhook-processor : détecter `nfm_reply`
- [ ] `variantSelection.ts` : flow optionnel

---

## Résumé des fichiers à créer / modifier

| Fichier | Action | Phase |
|---|---|---|
| `prisma/schema.prisma` | Modifier | 1 |
| `src/env.js` | Modifier | 1 |
| `src/server/catalogue/syncCatalogueItemToMeta.ts` | Créer | 2 |
| `src/server/catalogue/syncCatalogueItemToMeta.test.ts` | Créer | 2 |
| `src/server/api/routers/catalogue.ts` | Modifier | 2 |
| `src/server/messaging/templates.ts` | Modifier | 2/3/4 |
| `src/server/messaging/providers/meta/adapter.ts` | Modifier | 2/3/5 |
| `src/server/workers/queues.ts` | Modifier | 2 |
| `src/server/workers/webhook-processor.ts` | Modifier | 3/4 |
| `src/server/workers/reservation-ttl.ts` | Modifier | 3 |
| `src/server/flows/address.json` | Créer | 5 |
| `src/server/flows/variant.json` | Créer | 5 |
| `src/server/messaging/ai-service.ts` | Modifier | Progressif |
