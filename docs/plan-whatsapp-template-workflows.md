# Plan WhatsApp Template Workflows

## État au 14 septembre 2026

Le moteur contrôle désormais les 24 heures à chaque tentative, à partir du dernier horodatage entrant Meta. Un message reçu tardivement ou rejoué ne prolonge pas ce délai. Les anciennes lignes sans horodatage ne prouvent pas une fenêtre ouverte : le client doit écrire à nouveau.

Le suivi `order_status_update` est branché sur la sélection globale existante : mise en livraison, livraison et annulation. Hors fenêtre, il exige le droit `hasNotificationsOutside24h` (Starter/Pro), le consentement explicite `order_updates` du client, et un modèle français `UTILITY`, `APPROVED`, contenant uniquement le corps suivant :

> Votre commande {{1}} est {{2}}. Répondez à ce message pour contacter la boutique.

Les variables sont le numéro de commande et le statut. Le modèle est revérifié auprès de Meta avant chaque envoi ; aucune erreur ne déclenche un repli en texte libre. Les autres workflows restent limités à la fenêtre de service. Le plan multi-workflows ci-dessous décrit une évolution ultérieure, pas des fonctionnalités déjà disponibles.

Le client peut activer le suivi avec le bouton proposé après confirmation de commande. STOP garde priorité sur cet accord. Les fiches produit manuelles exigent l'attestation du vendeur que le client les a demandées, ainsi qu'une fenêtre ouverte ; cette attestation n'autorise pas des campagnes marketing.

### Mise en service

1. Appliquer `20260914130000_whatsapp_sending_policy` avant de démarrer la nouvelle application et le worker. Les modifications sont additives.
2. Créer le modèle dans WhatsApp Manager et fournir des exemples de variables (par exemple `CMD-42` et `livrée`). Attendre l'approbation de Meta.
3. Actualiser les modèles dans les paramètres WhatsApp et sélectionner le modèle compatible. Une ancienne sélection incompatible est bloquée, jamais convertie automatiquement.
4. Publier l'information de confidentialité mise à jour et informer les clients du traitement des messages et adresses par IA.

Les refus sont conservés dans `messages_out.last_error` (`whatsapp_window_closed`, `whatsapp_consent_missing`, `whatsapp_template_missing`, `whatsapp_template_incompatible`, `whatsapp_template_plan_required`, `whatsapp_product_consent_missing`). Les messages bloqués sont terminaux : changer un réglage ne relance pas une ancienne notification. Les échecs transitoires de vérification Meta restent soumis aux retries normaux de la file.

Les tests utilisent Meta simulé et une base PostgreSQL locale. Ils ne constituent ni une approbation de modèle ni un déploiement en production.

## Objectif

Passer d'une selection globale de template WhatsApp a une configuration par workflow SnapSell.

Cette evolution doit permettre de justifier `whatsapp_business_management` aupres de Meta tout en preparant l'usage produit reel des templates approuves pour les messages hors fenetre WhatsApp 24h.

## Slots Metier

Les premiers slots a supporter sont :

- `reservation_reminder` : rappel de reservation.
- `payment_reminder` : relance de preuve de paiement ou acompte.
- `order_confirmation` : confirmation de commande.
- `order_status_update` : mise a jour de statut commande.
- `delivery_or_pickup_update` : notification retrait ou livraison.
- `waitlist_notification` : notification client en liste d'attente.
- `general_reengagement` : message generique de reprise de contact.

Chaque slot doit avoir :

- un libelle affiche dans l'UI.
- une description courte.
- une categorie recommandee, probablement `UTILITY`.
- un statut `configured` ou `missing`.

## Modele De Donnees

Eviter d'ajouter une colonne par workflow sur `Tenant`. Creer une table dediee :

```prisma
model WhatsAppTemplateMapping {
  id           String   @id @default(cuid())
  tenantId     String
  slot         String
  templateName String
  language     String
  category     String
  status       String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, slot])
  @@index([tenantId])
}
```

## Backend

Ajouter ou remplacer les procedures tRPC suivantes :

- `fetchWhatsAppTemplates`
- `getWhatsAppTemplateMappings`
- `setWhatsAppTemplateMapping`
- `clearWhatsAppTemplateMapping`
- `refreshWhatsAppTemplateStatuses`

Lorsqu'un mapping est cree ou modifie, le backend doit verifier :

- le tenant a un WABA, un Phone Number ID et un token Meta.
- le template existe dans le WABA.
- le template est `APPROVED`.
- la langue correspond.
- le template appartient au WABA du tenant.

## UI

Dans `Parametres > WhatsApp > Templates`, remplacer la selection globale par une table de workflows :

```text
Workflow                     Template selectionne       Statut
Reservation reminder          reservation_reminder_fr    Approved
Payment reminder              payment_reminder_fr        Approved
Order confirmation            order_confirmation_fr      Approved
Delivery update               Non configure              Missing
```

Chaque ligne doit proposer :

- nom du workflow.
- usage court.
- select de template approuve.
- badge `Configured` ou `Missing`.
- action `Clear`.

Conserver un lien vers WhatsApp Manager pour creation, edition et approbation des templates.

## Envoi Metier

Etendre l'usage de `MetaCloudAdapter.sendTemplate(...)` pour accepter :

- `templateName`
- `language`
- `parameters`

Ajouter un service metier :

```ts
sendWorkflowTemplateMessage({
  tenantId,
  slot,
  to,
  parameters,
})
```

Ce service doit :

- recuperer le mapping du slot.
- verifier qu'il existe.
- appeler `sendTemplate`.
- journaliser l'envoi ou l'erreur.

## Workflows A Brancher

Brancher progressivement les workflows, dans cet ordre :

1. `reservation_reminder`
2. `payment_reminder`
3. `order_confirmation`
4. `delivery_or_pickup_update`
5. `waitlist_notification`
6. `general_reengagement`

Priorite technique :

- `reservation-ttl`
- `deposit-expiry`
- order service

## Fallback

Si aucun template n'est configure pour un slot :

- ne pas envoyer de message hors fenetre 24h.
- logger un warning clair.
- afficher `Template manquant` dans l'UI.

Ne pas envoyer un template generique a la place d'un slot specialise sans decision produit explicite.

## Migration Depuis L'Etat Actuel

L'etat actuel stocke une selection globale sur `Tenant` :

- `whatsappTemplateName`
- `whatsappTemplateLanguage`
- `whatsappTemplateCategory`

Migration recommandee :

- creer un mapping initial vers `general_reengagement` si ces champs sont renseignes.
- conserver les colonnes temporairement pour compatibilite.
- supprimer ces colonnes dans une migration ulterieure apres bascule complete.

## App Review Meta

La video de review pourra montrer :

- SnapSell recupere les templates approuves du WABA connecte.
- l'utilisateur associe un template approuve a un workflow metier.
- WhatsApp Manager montre que le template est cree et approuve.
- SnapSell sauvegarde cette association.

Cette demonstration soutient `whatsapp_business_management` car SnapSell gere l'utilisation de templates WhatsApp Business approuves dans le portail client.

## MVP Recommande

Le MVP complet pour review et produit est :

- mapping de templates par workflow.
- verification que chaque template selectionne est approuve dans Meta.
- pas de section d'envoi test dans l'UI.
- premier branchement metier sur `reservation_reminder`.
