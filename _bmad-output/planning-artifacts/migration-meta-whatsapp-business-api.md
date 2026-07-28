# Plan de Migration vers WhatsApp Business API (Meta)

**Date de création :** 2026-02-05  
**Status :** Planification future  
**Objectif :** Migrer SnapSell de Twilio vers Meta WhatsApp Business API pour améliorer l'expérience utilisateur et optimiser les coûts

---

## 📋 Vue d'ensemble

### Pourquoi migrer vers Meta ?

1. **Expérience utilisateur supérieure**
   - Sender ID : affichage du nom de l'entreprise au lieu du numéro
   - Badge de vérification WhatsApp Business (confiance)
   - Conversation unifiée (même numéro pour recevoir et envoyer)

2. **Coûts optimisés**
   - Pricing par conversation (meilleur pour conversations longues)
   - Pas de coût fixe par numéro
   - Modèle économique plus prévisible

3. **Scalabilité**
   - Support multi-tenant natif
   - Un seul compte Meta à gérer
   - Pas de gestion de multiples credentials Twilio

### Architecture actuelle

L'architecture SnapSell est déjà **provider-agnostic** (Architecture §7.1), ce qui facilite grandement la migration :
- Interface `MessagingProvider` abstraite
- Types normalisés (`InboundMessage`, `OutboundMessage`)
- Outbox pattern indépendant du BSP
- Workers métier ne dépendent pas du SDK Twilio

---

## 🎯 Prérequis Business

### 1. Compte Meta Business
- [ ] Créer compte sur [business.facebook.com](https://business.facebook.com)
- [ ] Vérifier identité entreprise (documents légaux)
- [ ] Créer Business Manager
- [ ] **Timeline :** 1-2 jours

### 2. Compte Meta Developer
- [ ] Créer compte sur [developers.facebook.com](https://developers.facebook.com)
- [ ] Lier au Business Manager
- [ ] **Timeline :** 1 jour

### 3. Application Meta Business
- [ ] Créer application type "Business"
- [ ] Ajouter produit "WhatsApp"
- [ ] Obtenir WABA (WhatsApp Business Account) de test
- [ ] Obtenir numéro de test gratuit
- [ ] **Timeline :** 1 jour

### 4. Vérification Business
- [ ] Soumettre documents légaux (extrait K-bis, etc.)
- [ ] Vérifier adresse entreprise
- [ ] Vérifier numéro téléphone (SMS ou appel)
- [ ] **Timeline :** 1-3 semaines (délais Meta)

### 5. Vérification WhatsApp Business
- [ ] Soumettre demande vérification
- [ ] Attendre approbation (badge vert)
- [ ] **Timeline :** 1-3 semaines

### 6. App Review (Production)
- [ ] Préparer templates de messages
- [ ] Soumettre pour review
- [ ] Démonstration utilisation
- [ ] **Timeline :** 1-2 semaines

**Total prérequis business :** 4-9 semaines (selon délais Meta)

---

## 🔧 Prérequis Techniques

### Credentials nécessaires

1. **Access Token**
   - Type : System Token (recommandé pour production)
   - Généré dans : App Dashboard > WhatsApp > API Setup
   - Stockage : Variable d'environnement ou DB sécurisée

2. **App ID et App Secret**
   - Disponibles dans : App Settings > Basic
   - Pour authentification OAuth

3. **Webhook Verify Token**
   - Token personnalisé (ex: UUID)
   - Pour vérification webhook Meta

4. **Phone Number ID**
   - ID du numéro WhatsApp Business
   - Un par numéro enregistré
   - Utilisé pour envoyer messages

5. **Business Account ID (WABA ID)**
   - ID du WhatsApp Business Account
   - Pour gérer templates et configuration

### Configuration Webhook

- **URL :** `https://snapsell.com/api/webhooks/meta`
- **Vérification :** Challenge GET avec verify token
- **Signature :** HMAC-SHA256 dans header `X-Hub-Signature-256`
- **Events :** `messages`, `message_status`

---

## 📊 Modifications Base de Données

### Nouvelle table : TenantMessagingConfig

```prisma
model TenantMessagingConfig {
  id                    String   @id @default(cuid())
  tenantId              String   @unique @map("tenant_id")
  tenant                Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  // Provider selection
  provider              String   @default("twilio") // "twilio" | "meta"
  
  // Twilio config (si provider = "twilio")
  twilioAccountSid      String?  @map("twilio_account_sid")
  twilioAuthToken       String?  @db.Text @map("twilio_auth_token")
  twilioWhatsappNumber  String?  @map("twilio_whatsapp_number")
  
  // Meta config (si provider = "meta")
  metaAppId             String?  @map("meta_app_id")
  metaAppSecret         String?  @map("meta_app_secret")
  metaPhoneNumberId     String?  @map("meta_phone_number_id")
  metaWabaId            String?  @map("meta_waba_id")
  metaAccessToken       String?  @db.Text @map("meta_access_token")
  metaWebhookVerifyToken String?  @map("meta_webhook_verify_token")
  
  // Status
  metaVerified          Boolean  @default(false) @map("meta_verified")
  metaVerificationDate  DateTime? @map("meta_verification_date")
  
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  @@index([tenantId])
  @@index([provider])
  @@map("tenant_messaging_config")
}
```

### Migration SQL

```sql
-- Migration: add_tenant_messaging_config
CREATE TABLE IF NOT EXISTS "tenant_messaging_config" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'twilio',
    
    -- Twilio
    "twilio_account_sid" TEXT,
    "twilio_auth_token" TEXT,
    "twilio_whatsapp_number" TEXT,
    
    -- Meta
    "meta_app_id" TEXT,
    "meta_app_secret" TEXT,
    "meta_phone_number_id" TEXT,
    "meta_waba_id" TEXT,
    "meta_access_token" TEXT,
    "meta_webhook_verify_token" TEXT,
    "meta_verified" BOOLEAN NOT NULL DEFAULT false,
    "meta_verification_date" TIMESTAMP(3),
    
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_messaging_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_messaging_config_tenant_id_key" ON "tenant_messaging_config"("tenant_id");
CREATE INDEX "tenant_messaging_config_tenant_id_idx" ON "tenant_messaging_config"("tenant_id");
CREATE INDEX "tenant_messaging_config_provider_idx" ON "tenant_messaging_config"("provider");

ALTER TABLE "tenant_messaging_config" 
ADD CONSTRAINT "tenant_messaging_config_tenant_id_fkey" 
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") 
ON DELETE CASCADE ON UPDATE CASCADE;
```

---

## 💻 Développement Technique

### Phase 1 : Structure de base (1 semaine)

#### 1.1 Créer adaptateur Meta

**Fichier :** `src/server/messaging/providers/meta/adapter.ts`

```typescript
import type { MessagingProvider, InboundMessage, OutboundMessage, ProviderSendResult } from "../../types";
import { webhookLogger, workerLogger } from "~/lib/logger";

/**
 * Adapteur Meta WhatsApp Business API pour MessagingProvider
 * Implémente l'interface provider-agnostic (§7.1)
 */
export class MetaAdapter implements MessagingProvider {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly phoneNumberId: string;
  private readonly accessToken: string;
  private readonly wabaId: string;

  constructor(config: {
    appId: string;
    appSecret: string;
    phoneNumberId: string;
    accessToken: string;
    wabaId: string;
  }) {
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.phoneNumberId = config.phoneNumberId;
    this.accessToken = config.accessToken;
    this.wabaId = config.wabaId;
  }

  async parseInbound(req: Request): Promise<InboundMessage> {
    // Parse webhook Meta → InboundMessage normalisé
    // TODO: Implémenter parsing webhook Meta
  }

  async verifySignature(req: Request, secret: string): Promise<boolean> {
    // Vérification X-Hub-Signature-256
    // TODO: Implémenter vérification signature Meta
  }

  async send(message: OutboundMessage): Promise<ProviderSendResult> {
    // Envoi via Meta Cloud API
    // Utilise Phone Number ID comme "from"
    // TODO: Implémenter envoi Meta
  }
}
```

#### 1.2 Créer route webhook Meta

**Fichier :** `src/app/api/webhooks/meta/route.ts`

```typescript
import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { MetaAdapter } from "~/server/messaging/providers/meta/adapter";
import { webhookLogger } from "~/lib/logger";

/**
 * Route webhook Meta WhatsApp Business API
 * Similarité avec route Twilio mais adapté pour Meta
 */
export async function GET(request: Request) {
  // Webhook verification challenge (Meta)
  // TODO: Implémenter challenge GET
}

export async function POST(request: Request) {
  // Réception webhook Meta
  // TODO: Implémenter traitement webhook Meta
}
```

#### 1.3 Mettre à jour outbox-sender

**Fichier :** `src/server/workers/outbox-sender.ts`

```typescript
// Ajouter fonction pour récupérer adaptateur selon tenant
async function getMessagingAdapter(tenantId: string): Promise<MessagingProvider> {
  const config = await db.tenantMessagingConfig.findUnique({
    where: { tenantId },
  });

  if (!config) {
    throw new Error(`No messaging config found for tenant ${tenantId}`);
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
    // Twilio (défaut)
    return new TwilioAdapter(
      config.twilioAuthToken ?? env.TWILIO_AUTH_TOKEN ?? "",
      config.twilioAccountSid ?? env.TWILIO_ACCOUNT_SID,
      config.twilioWhatsappNumber ?? env.TWILIO_WHATSAPP_NUMBER,
    );
  }
}

// Modifier processOutboundMessage pour utiliser getMessagingAdapter
async function processOutboundMessage(messageOut: MessageOut) {
  // ...
  const adapter = await getMessagingAdapter(messageOut.tenantId);
  const result = await adapter.send(outboundMessage);
  // ...
}
```

### Phase 2 : Implémentation complète (1-2 semaines)

#### 2.1 Parsing webhook Meta

- Parser payload JSON Meta
- Extraire `from`, `body`, `message_id`
- Générer `correlationId`
- Résoudre `tenantId` depuis Phone Number ID

#### 2.2 Vérification signature

- Lire header `X-Hub-Signature-256`
- Calculer HMAC-SHA256 du body
- Comparer avec signature reçue

#### 2.3 Envoi messages

- Appel API Meta Cloud API
- Gérer fenêtre de conversation (24h)
- Utiliser templates pour messages hors fenêtre
- Gérer rate limits

#### 2.4 Gestion templates

- Créer service pour soumettre templates
- Gérer statuts templates (pending, approved, rejected)
- Utiliser templates dans outbox-sender

### Phase 3 : Tests et validation (1 semaine)

- Tests unitaires adaptateur Meta
- Tests intégration webhook Meta
- Tests end-to-end (envoi/réception)
- Tests migration progressive tenant par tenant

---

## 🚀 Plan de Migration Progressive

### Étape 1 : Préparation (Semaine 1-2)

- [ ] Créer table `TenantMessagingConfig`
- [ ] Migrer données existantes (tous tenants → provider = "twilio")
- [ ] Créer structure adaptateur Meta (squelette)
- [ ] Créer route webhook Meta (squelette)

### Étape 2 : Développement (Semaine 3-4)

- [ ] Implémenter adaptateur Meta complet
- [ ] Implémenter route webhook Meta
- [ ] Mettre à jour outbox-sender pour support multi-provider
- [ ] Tests unitaires et intégration

### Étape 3 : Test avec tenant pilote (Semaine 5)

- [ ] Configurer tenant de test avec Meta
- [ ] Tester envoi/réception messages
- [ ] Valider templates
- [ ] Corriger bugs éventuels

### Étape 4 : Migration progressive (Semaine 6+)

- [ ] Migrer tenants un par un
- [ ] Monitorer métriques (taux succès, latence)
- [ ] Garder Twilio en fallback si nécessaire
- [ ] Documenter processus migration

### Étape 5 : Dépréciation Twilio (optionnel)

- [ ] Une fois tous les tenants migrés
- [ ] Déprécier support Twilio
- [ ] Nettoyer code Twilio (ou garder pour fallback)

---

## 📈 Métriques à Surveiller

### Pendant la migration

- **Taux de succès d'envoi** : Meta vs Twilio
- **Latence** : Temps d'envoi Meta vs Twilio
- **Coûts** : Comparaison coûts Meta vs Twilio
- **Erreurs** : Taux d'erreurs par provider
- **Satisfaction utilisateur** : Feedback sur expérience

### Après migration

- **Taux de succès global** : > 99%
- **Latence P95** : < 500ms
- **Coûts** : Réduction de 20-30% attendue
- **Templates approuvés** : 100% des templates nécessaires

---

## 🐛 Gestion des Erreurs

### Fallback automatique

Si Meta échoue, basculer vers Twilio :

```typescript
async function processOutboundMessage(messageOut: MessageOut) {
  try {
    const adapter = await getMessagingAdapter(messageOut.tenantId);
    const result = await adapter.send(outboundMessage);
    
    if (!result.success && messageOut.tenantId) {
      // Fallback vers Twilio si Meta échoue
      const fallbackAdapter = new TwilioAdapter(...);
      return await fallbackAdapter.send(outboundMessage);
    }
    
    return result;
  } catch (error) {
    // Log et fallback
  }
}
```

### Monitoring

- Alertes si taux d'erreur Meta > 5%
- Alertes si latence Meta > 1s
- Dashboard comparatif Meta vs Twilio

---

## 📝 Checklist Complète

### Business
- [ ] Compte Meta Business créé
- [ ] Compte Meta Developer créé
- [ ] Application Business créée avec WhatsApp
- [ ] WABA créé
- [ ] Business vérifié
- [ ] WhatsApp Business vérifié
- [ ] Templates soumis et approuvés

### Technique
- [ ] Table `TenantMessagingConfig` créée
- [ ] Adaptateur Meta implémenté
- [ ] Route webhook Meta créée
- [ ] Outbox-sender mis à jour (multi-provider)
- [ ] Gestion templates implémentée
- [ ] Gestion fenêtre conversation (24h)
- [ ] Tests unitaires passent
- [ ] Tests intégration passent

### Migration
- [ ] Tenant pilote migré et testé
- [ ] Processus migration documenté
- [ ] Monitoring en place
- [ ] Plan rollback préparé
- [ ] Communication clients préparée

---

## 📚 Ressources

### Documentation Meta

- [WhatsApp Cloud API Documentation](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Business Management API](https://developers.facebook.com/docs/whatsapp/business-management-api)
- [Webhooks Guide](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)
- [Templates Guide](https://developers.facebook.com/docs/whatsapp/message-templates)

### Outils

- [Meta Business Suite](https://business.facebook.com)
- [Meta Developers Console](https://developers.facebook.com)
- [WhatsApp Business API Testing Tool](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started)

---

## ⚠️ Risques et Mitigation

### Risque 1 : Délais vérification Meta
- **Mitigation :** Commencer processus vérification tôt, en parallèle du développement

### Risque 2 : Templates non approuvés
- **Mitigation :** Préparer templates à l'avance, soumettre dès que possible

### Risque 3 : Problèmes techniques migration
- **Mitigation :** Migration progressive, fallback Twilio, tests approfondis

### Risque 4 : Coûts supérieurs
- **Mitigation :** Monitorer coûts, comparer avec Twilio, ajuster si nécessaire

---

## 🎯 Timeline Estimée

| Phase | Durée | Description |
|-------|-------|-------------|
| Prérequis Business | 4-9 semaines | Vérifications Meta |
| Développement | 2-3 semaines | Implémentation technique |
| Tests | 1 semaine | Tests et validation |
| Migration | 2-4 semaines | Migration progressive |
| **Total** | **9-17 semaines** | Selon délais Meta |

---

## 📞 Support

Pour questions ou problèmes pendant la migration :
- Documentation Meta : [developers.facebook.com/docs/whatsapp](https://developers.facebook.com/docs/whatsapp)
- Support Meta : Via Business Manager
- Documentation interne : Ce document

---

**Note :** Ce plan est une roadmap pour migration future. L'implémentation actuelle avec Twilio reste fonctionnelle et peut être utilisée en production pendant la préparation de la migration vers Meta.
