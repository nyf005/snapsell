# Guide d'Implémentation : Migration vers Meta WhatsApp Business API

**Date :** 2026-02-05  
**Status :** Documentation technique pour migration future  
**Objectif :** Guide pas-à-pas pour implémenter le support Meta dans SnapSell

---

## 📋 Vue d'ensemble

Ce guide détaille l'implémentation technique de la migration vers Meta WhatsApp Business API. L'architecture actuelle est déjà provider-agnostic, ce qui facilite grandement l'ajout du support Meta.

---

## 🗄️ Étape 1 : Base de Données

### 1.1 Créer la migration Prisma

**Fichier :** `prisma/migrations/YYYYMMDDHHMMSS_add_tenant_messaging_config/migration.sql`

```sql
-- Créer table tenant_messaging_config
CREATE TABLE IF NOT EXISTS "tenant_messaging_config" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'twilio',
    
    -- Twilio config
    "twilio_account_sid" TEXT,
    "twilio_auth_token" TEXT,
    "twilio_whatsapp_number" TEXT,
    
    -- Meta config
    "meta_app_id" TEXT,
    "meta_app_secret" TEXT,
    "meta_phone_number_id" TEXT,
    "meta_waba_id" TEXT,
    "meta_access_token" TEXT,
    "meta_webhook_verify_token" TEXT,
    "meta_verified" BOOLEAN NOT NULL DEFAULT false,
    "meta_verification_date" TIMESTAMP(3),
    
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_messaging_config_pkey" PRIMARY KEY ("id")
);

-- Contraintes et index
CREATE UNIQUE INDEX "tenant_messaging_config_tenant_id_key" ON "tenant_messaging_config"("tenant_id");
CREATE INDEX "tenant_messaging_config_tenant_id_idx" ON "tenant_messaging_config"("tenant_id");
CREATE INDEX "tenant_messaging_config_provider_idx" ON "tenant_messaging_config"("provider");

-- Foreign key
ALTER TABLE "tenant_messaging_config" 
ADD CONSTRAINT "tenant_messaging_config_tenant_id_fkey" 
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") 
ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrer données existantes : créer config pour tous les tenants existants avec provider = 'twilio'
INSERT INTO "tenant_messaging_config" ("id", "tenant_id", "provider", "created_at", "updated_at")
SELECT 
    gen_random_uuid()::text,
    "id",
    'twilio',
    NOW(),
    NOW()
FROM "tenants"
ON CONFLICT ("tenant_id") DO NOTHING;
```

### 1.2 Mettre à jour schema.prisma

```prisma
model TenantMessagingConfig {
  id                    String   @id @default(cuid())
  tenantId              String   @unique @map("tenant_id")
  tenant                Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  // Provider selection
  provider              String   @default("twilio") // "twilio" | "meta"
  
  // Twilio config
  twilioAccountSid      String?  @map("twilio_account_sid")
  twilioAuthToken       String?  @db.Text @map("twilio_auth_token")
  twilioWhatsappNumber  String?  @map("twilio_whatsapp_number")
  
  // Meta config
  metaAppId             String?  @map("meta_app_id")
  metaAppSecret         String?  @map("meta_app_secret")
  metaPhoneNumberId     String?  @map("meta_phone_number_id")
  metaWabaId            String?  @map("meta_waba_id")
  metaAccessToken       String?  @db.Text @map("meta_access_token")
  metaWebhookVerifyToken String?  @map("meta_webhook_verify_token")
  metaVerified          Boolean  @default(false) @map("meta_verified")
  metaVerificationDate  DateTime? @map("meta_verification_date")
  
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  @@index([tenantId])
  @@index([provider])
  @@map("tenant_messaging_config")
}

// Ajouter relation dans Tenant
model Tenant {
  // ... champs existants
  messagingConfig       TenantMessagingConfig?
}
```

---

## 🔧 Étape 2 : Variables d'Environnement

### 2.1 Ajouter dans `src/env.js`

```javascript
server: {
  // ... existants
  // Meta WhatsApp Business API
  META_APP_ID: z.string().min(1).optional(),
  META_APP_SECRET: z.string().min(1).optional(),
  META_PHONE_NUMBER_ID: z.string().min(1).optional(),
  META_WABA_ID: z.string().min(1).optional(),
  META_ACCESS_TOKEN: z.string().min(1).optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(1).optional(),
},

runtimeEnv: {
  // ... existants
  META_APP_ID: process.env.META_APP_ID,
  META_APP_SECRET: process.env.META_APP_SECRET,
  META_PHONE_NUMBER_ID: process.env.META_PHONE_NUMBER_ID,
  META_WABA_ID: process.env.META_WABA_ID,
  META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN,
  META_WEBHOOK_VERIFY_TOKEN: process.env.META_WEBHOOK_VERIFY_TOKEN,
},
```

### 2.2 Ajouter dans `.env.example`

```bash
# Meta WhatsApp Business API Configuration
META_APP_ID=""
META_APP_SECRET=""
META_PHONE_NUMBER_ID=""
META_WABA_ID=""
META_ACCESS_TOKEN=""
META_WEBHOOK_VERIFY_TOKEN=""
```

---

## 💻 Étape 3 : Implémentation Adaptateur Meta

### 3.1 Créer structure de dossiers

```
src/server/messaging/providers/meta/
  ├── adapter.ts
  ├── adapter.test.ts
  └── webhook-schema.ts
```

### 3.2 Implémenter adaptateur Meta

Voir fichier `src/server/messaging/providers/meta/adapter.ts.example` pour exemple complet.

**Points clés :**
- Implémenter interface `MessagingProvider`
- Vérification signature HMAC-SHA256
- Parsing webhook Meta (structure différente de Twilio)
- Envoi via Meta Cloud API
- Support templates pour messages hors fenêtre 24h

### 3.3 Créer schéma Zod pour webhook Meta

**Fichier :** `src/lib/zod/meta-webhook.ts`

```typescript
import { z } from "zod";

export const metaWebhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          value: z.object({
            messaging_product: z.literal("whatsapp"),
            metadata: z.object({
              display_phone_number: z.string(),
              phone_number_id: z.string(),
            }),
            messages: z.array(
              z.object({
                from: z.string(),
                id: z.string(),
                timestamp: z.string(),
                type: z.string(),
                text: z
                  .object({
                    body: z.string(),
                  })
                  .optional(),
                image: z
                  .object({
                    url: z.string(),
                  })
                  .optional(),
                video: z
                  .object({
                    url: z.string(),
                  })
                  .optional(),
                document: z
                  .object({
                    url: z.string(),
                  })
                  .optional(),
              }),
            ).optional(),
          }),
          field: z.string(),
        }),
      ),
    }),
  ),
});
```

---

## 🌐 Étape 4 : Route Webhook Meta

### 4.1 Créer route webhook

Voir fichier `src/app/api/webhooks/meta/route.ts.example` pour exemple complet.

**Points clés :**
- GET : Challenge de vérification webhook
- POST : Réception messages entrants
- Vérification signature
- Résolution tenant depuis phoneNumberId
- Idempotence (même logique que Twilio)
- Enqueue job pour traitement asynchrone

### 4.2 Configurer webhook dans Meta

1. Aller dans Meta Business Manager
2. App Settings > WhatsApp > Configuration
3. Ajouter webhook URL : `https://snapsell.com/api/webhooks/meta`
4. Configurer verify token (META_WEBHOOK_VERIFY_TOKEN)
5. Sélectionner events : `messages`, `message_status`

---

## 🔄 Étape 5 : Mettre à jour Outbox-Sender

### 5.1 Créer fonction helper pour récupérer adaptateur

**Fichier :** `src/server/messaging/providers/factory.ts`

```typescript
import { db } from "~/server/db";
import { TwilioAdapter } from "./twilio/adapter";
import { MetaAdapter } from "./meta/adapter";
import type { MessagingProvider } from "../types";
import { env } from "~/env";

/**
 * Récupère l'adaptateur MessagingProvider approprié pour un tenant
 * @param tenantId - ID du tenant
 * @returns Adaptateur MessagingProvider (Twilio ou Meta)
 */
export async function getMessagingAdapter(tenantId: string): Promise<MessagingProvider> {
  const config = await db.tenantMessagingConfig.findUnique({
    where: { tenantId },
  });

  if (!config) {
    // Fallback vers Twilio global si pas de config
    return new TwilioAdapter(
      env.TWILIO_AUTH_TOKEN ?? "",
      env.TWILIO_ACCOUNT_SID,
      env.TWILIO_WHATSAPP_NUMBER,
    );
  }

  if (config.provider === "meta") {
    if (!config.metaAppId || !config.metaAccessToken || !config.metaPhoneNumberId) {
      throw new Error(`Incomplete Meta config for tenant ${tenantId}`);
    }

    return new MetaAdapter({
      appId: config.metaAppId,
      appSecret: config.metaAppSecret ?? "",
      phoneNumberId: config.metaPhoneNumberId,
      accessToken: config.metaAccessToken,
      wabaId: config.metaWabaId ?? "",
    });
  } else {
    // Twilio (défaut ou configuré)
    return new TwilioAdapter(
      config.twilioAuthToken ?? env.TWILIO_AUTH_TOKEN ?? "",
      config.twilioAccountSid ?? env.TWILIO_ACCOUNT_SID,
      config.twilioWhatsappNumber ?? env.TWILIO_WHATSAPP_NUMBER,
    );
  }
}
```

### 5.2 Modifier outbox-sender.ts

```typescript
// Remplacer création directe TwilioAdapter par :
import { getMessagingAdapter } from "~/server/messaging/providers/factory";

async function processOutboundMessage(messageOut: MessageOut) {
  // ...
  
  try {
    // Récupérer adaptateur selon config tenant
    const adapter = await getMessagingAdapter(messageOut.tenantId);
    
    // Le reste du code reste identique !
    const result = await adapter.send(outboundMessage);
    // ...
  }
}
```

---

## 🧪 Étape 6 : Tests

### 6.1 Tests unitaires adaptateur Meta

**Fichier :** `src/server/messaging/providers/meta/adapter.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MetaAdapter } from "./adapter";

describe("MetaAdapter", () => {
  const config = {
    appId: "test-app-id",
    appSecret: "test-app-secret",
    phoneNumberId: "test-phone-id",
    accessToken: "test-access-token",
    wabaId: "test-waba-id",
  };

  let adapter: MetaAdapter;

  beforeEach(() => {
    adapter = new MetaAdapter(config);
    vi.clearAllMocks();
  });

  describe("verifySignature", () => {
    it("should verify valid Meta signature", async () => {
      // Test vérification signature
    });
  });

  describe("parseInbound", () => {
    it("should parse Meta webhook payload", async () => {
      // Test parsing webhook
    });
  });

  describe("send", () => {
    it("should send message via Meta API", async () => {
      // Test envoi message
    });
  });
});
```

### 6.2 Tests intégration webhook

**Fichier :** `src/app/api/webhooks/meta/route.integration.test.ts`

```typescript
import { describe, it, expect } from "vitest";

describe("Meta webhook route", () => {
  it("should verify webhook challenge", async () => {
    // Test GET challenge
  });

  it("should process incoming message", async () => {
    // Test POST webhook
  });
});
```

---

## 📝 Étape 7 : Gestion Templates Meta

### 7.1 Créer service templates

**Fichier :** `src/server/messaging/providers/meta/templates.ts`

```typescript
/**
 * Service pour gérer les templates Meta WhatsApp Business API
 */

export interface TemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  parameters?: Array<{
    type: "text" | "currency" | "date_time";
    text?: string;
    currency?: { code: string; amount: number };
    date_time?: { fallback_value: string };
  }>;
}

export interface CreateTemplateRequest {
  name: string;
  language: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  components: TemplateComponent[];
}

/**
 * Créer un template Meta
 */
export async function createTemplate(
  wabaId: string,
  accessToken: string,
  template: CreateTemplateRequest,
): Promise<{ id: string; status: string }> {
  const apiUrl = `https://graph.facebook.com/v21.0/${wabaId}/message_templates`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(template),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to create template: ${error.error?.message}`);
  }

  return await response.json();
}

/**
 * Lister les templates d'un WABA
 */
export async function listTemplates(
  wabaId: string,
  accessToken: string,
): Promise<Array<{ id: string; name: string; status: string }>> {
  const apiUrl = `https://graph.facebook.com/v21.0/${wabaId}/message_templates`;

  const response = await fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to list templates");
  }

  const data = await response.json();
  return data.data || [];
}
```

---

## 🔐 Étape 8 : Sécurité

### 8.1 Chiffrement credentials

- Stocker `metaAccessToken` et `metaAppSecret` chiffrés en DB
- Utiliser librairie de chiffrement (ex: `crypto` Node.js)
- Rotation régulière des tokens

### 8.2 Validation webhook

- Toujours vérifier signature avant traitement
- Rejeter requêtes non authentifiées
- Logger tentatives d'accès non autorisées

---

## 📊 Étape 9 : Monitoring

### 9.1 Métriques à tracker

- Taux de succès d'envoi Meta vs Twilio
- Latence Meta vs Twilio
- Coûts par provider
- Erreurs par type (signature, API, etc.)

### 9.2 Alertes

- Taux d'erreur Meta > 5%
- Latence Meta > 1s
- Token expiré ou invalide

---

## ✅ Checklist Implémentation

### Base de données
- [ ] Migration créée et testée
- [ ] Schema Prisma mis à jour
- [ ] Données existantes migrées (provider = "twilio")

### Code
- [ ] Adaptateur Meta implémenté
- [ ] Route webhook Meta créée
- [ ] Factory function pour adaptateurs
- [ ] Outbox-sender mis à jour
- [ ] Service templates créé

### Configuration
- [ ] Variables d'environnement ajoutées
- [ ] Webhook configuré dans Meta
- [ ] Templates soumis et approuvés

### Tests
- [ ] Tests unitaires adaptateur
- [ ] Tests intégration webhook
- [ ] Tests end-to-end

### Documentation
- [ ] Guide utilisateur (config Meta)
- [ ] Documentation API
- [ ] Runbook ops

---

## 🚀 Déploiement

### Ordre de déploiement

1. **Migration DB** : Appliquer migration en production
2. **Code** : Déployer code avec support Meta (désactivé par défaut)
3. **Configuration** : Configurer webhook Meta
4. **Test** : Tester avec tenant pilote
5. **Migration** : Migrer tenants progressivement

### Rollback

Si problèmes :
1. Reconfigurer tenants vers provider = "twilio"
2. Désactiver route webhook Meta temporairement
3. Analyser logs et corriger

---

## 📚 Ressources

- [Meta Cloud API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Webhooks Guide](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)
- [Templates Guide](https://developers.facebook.com/docs/whatsapp/message-templates)
- [Business Management API](https://developers.facebook.com/docs/whatsapp/business-management-api)

---

**Note :** Ce guide est une référence pour la migration future. Les fichiers `.example` peuvent être utilisés comme base pour l'implémentation complète.
