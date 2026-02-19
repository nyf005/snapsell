# Migration Twilio → WhatsApp Cloud API (Meta)

## Contexte

Aujourd'hui le bot utilise **un seul numéro Twilio partagé** (`TWILIO_WHATSAPP_NUMBER`) pour tous les tenants. L'objectif est de passer à l'API WhatsApp directe (Meta Cloud API) pour que **chaque tenant ait son propre numéro WhatsApp Business** et que le bot réponde directement depuis le numéro du tenant.

## Architecture actuelle (isolation Twilio)

Twilio est contenu dans **2 fichiers seulement** :

| Fichier | Rôle |
|---------|------|
| `src/server/messaging/providers/twilio/adapter.ts` | `TwilioAdapter implements MessagingProvider` |
| `src/app/api/webhooks/twilio/route.ts` | Endpoint webhook inbound |

L'interface `MessagingProvider` (`src/server/messaging/types.ts`) est déjà agnostique. Tout le business logic (webhook-processor, réservations, waitlist, outbox, event log) ne dépend pas de Twilio.

---

## Fichiers à créer

| Fichier | Rôle |
|---------|------|
| `src/server/messaging/providers/meta/adapter.ts` | `MetaCloudAdapter implements MessagingProvider` |
| `src/app/api/webhooks/meta/route.ts` | Endpoint webhook Meta (POST inbound + GET challenge) |

## Fichiers à modifier

### 1. Schema Prisma — credentials Meta par tenant

```prisma
model Tenant {
  // existant
  whatsappPhoneNumber    String?  @unique

  // nouveau
  metaPhoneNumberId      String?  // Phone Number ID Meta
  metaWabaId             String?  // WhatsApp Business Account ID
  metaAccessToken        String?  // Token d'accès (chiffré)
}
```

Aujourd'hui le `from` est un env var global (`TWILIO_WHATSAPP_NUMBER`). Demain c'est un champ par tenant en base.

### 2. `src/server/messaging/providers/meta/adapter.ts` — nouvel adapter

- `parseInbound()` : le webhook Meta envoie du **JSON** (pas du form-urlencoded comme Twilio), avec une structure imbriquée `entry[].changes[].value.messages[]`
- `verifySignature()` : vérification **HMAC-SHA256** du header `X-Hub-Signature-256` avec le App Secret
- `send()` : `POST https://graph.facebook.com/v21.0/{phone_number_id}/messages` avec le token du tenant
- Support des **templates** (obligatoire pour initier une conversation après 24h)

### 3. `src/app/api/webhooks/meta/route.ts` — nouveau webhook

- Gérer le **challenge de vérification** (`GET` avec `hub.verify_token`) — Meta l'exige à la configuration
- `POST` : parser le payload JSON Meta, résoudre le tenant via `metaPhoneNumberId`, puis même flux qu'aujourd'hui (persist MessageIn → enqueue BullMQ)

### 4. `src/server/workers/outbox-sender.ts` (~10 lignes)

- Au lieu de toujours créer un `TwilioAdapter`, résoudre le provider du tenant et instancier le bon adapter
- Passer le `metaAccessToken` et `metaPhoneNumberId` du tenant à l'adapter Meta

### 5. `src/lib/zod/webhook.ts`

- Ajouter un schema de validation pour le payload Meta (structure différente de Twilio)

### 6. `src/env.js`

- Ajouter `META_APP_SECRET` (pour la vérification webhook) et `META_VERIFY_TOKEN` (pour le challenge GET)

---

## Ce qui ne change PAS

- **Tout le business logic** : webhook-processor, réservations, waitlist, outbox writer, event log — zéro modification
- **L'interface `MessagingProvider`** dans `types.ts` — déjà agnostique
- **Les types `InboundMessage` / `OutboundMessage`** — déjà génériques
- **La base `messages_in` / `messages_out`** — colonnes provider-agnostiques (`providerMessageId`, pas `twilioMessageSid`)

---

## Différences Meta vs Twilio

| Sujet | Twilio | Meta Cloud API |
|-------|--------|----------------|
| **Initiation conversation** | Libre | Templates obligatoires après 24h d'inactivité |
| **Media** | URL directe dans le message | Upload media d'abord, puis envoyer le `media_id` |
| **Webhook** | form-urlencoded, 1 message = 1 POST | JSON, batch possible (plusieurs messages dans 1 POST) |
| **Auth** | Account SID + Auth Token (global) | Access Token **par numéro** (par tenant) |
| **Signature** | HMAC-SHA1 (Twilio) | HMAC-SHA256 (Meta) |
| **Numéro** | 1 numéro Twilio partagé | 1 numéro WhatsApp Business par tenant |

---

## Ordre d'implémentation recommandé

1. Ajouter les champs Meta au schema Prisma + UI config tenant
2. Créer l'adapter Meta + tests
3. Créer le webhook Meta + challenge GET
4. Modifier l'outbox-sender pour résoudre le provider par tenant
5. Tester en parallèle (les deux providers cohabitent)
6. Retirer Twilio quand tous les tenants sont migrés

L'effort principal est dans l'adapter Meta (parsing webhook + envoi + templates). Le reste c'est du branchement.
