---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - prd.md
  - architecture.md
  - ux-design-specification.md
workflowType: 'create-epics-and-stories'
project_name: 'SnapSell'
date: '2026-02-03'
---

# SnapSell - Epic Breakdown

## Overview

Ce document fournit le découpage en epics et stories pour SnapSell, en décomposant les exigences du PRD, de l'UX Design et de l'Architecture en stories implémentables.

## Requirements Inventory

### Functional Requirements

**Onboarding & Configuration**
- FR1: Le vendeur peut s'inscrire et créer un tenant (espace isolé).
- FR2: Le vendeur (ou manager) peut configurer une grille catégories→prix (ex. A, B, C → montants).
- FR3: Le vendeur (ou manager) peut configurer les frais de livraison (optionnel).
- FR4: Le vendeur peut connecter un numéro WhatsApp (Twilio) à son tenant.
- FR5: Le manager peut inviter un agent et lui donner accès au dashboard (commandes, proofs).

**WhatsApp Messaging & Routing**
- FR6: Le système peut recevoir des messages entrants WhatsApp (webhook) et les attribuer au bon tenant.
- FR7: Le système peut distinguer un message vendeur d'un message client ; numéros vendeur = seller_phone(s) enregistrés côté tenant.
- FR8: Le système peut traiter les messages de façon idempotente (éviter doublons par MessageSid + tenant).
- FR9: Le système peut envoyer des messages sortants WhatsApp (notifications, rappels, statuts) via outbox + retry + DLQ.
- FR10: Le client peut signaler l'arrêt des messages (STOP) et le système en tient compte.

**Live Session (auto)**
- FR39: Le système crée automatiquement une live_session active au premier signal « live » (création item vendeur ou 1ère réservation client) ; met à jour last_activity_at ; ferme la session après inactivité (T_inactive configurable, ex. 30–60 min) ou via job.

**Pricing & Codes**
- FR11: Le système peut appliquer un prix à un code à partir de la lettre du code et de la grille catégories→prix du tenant.
- FR12: Le système garantit l'unicité d'un code dans (tenant_id, live_session_id, code).
- FR13: Le vendeur peut utiliser des codes au format libre (ex. A12, B7) sans catalogue préalable.
- FR40: Si le vendeur renvoie un code déjà existant en session : pas d'update implicite ; bot répond « Code déjà utilisé, choisis un autre ou envoie MODIF A12 … ».

**Products & Stock**
- FR14: Le système peut traiter un code non préparé comme article unique (quantité 1).
- FR15: Le vendeur peut enregistrer du stock préparé sur WhatsApp (prioritaire MVP) : CODE xQTE + photo optionnelle + tailles optionnelles.
- FR16: Le système décrémente le stock préparé uniquement à la confirmation de commande (pas à la réservation) ; pendant la réservation, « blocage » sans consommer le stock.
- FR17: Le système empêche la confirmation si le stock est épuisé et gère la concurrence (transaction atomique, waitlist si dispo).

**Reservations & Waitlist**
- FR18: Le client peut réserver un article (code) puis fournir son adresse et confirmer (OUI) ; tunnel réservation → collecte adresse → confirmation → commande ; réservation et file attachées à un live_item / live_session active.
- FR19: Le système peut placer le client en file d'attente si l'article est déjà réservé.
- FR20: Le système peut appliquer un TTL configurable à une réservation (ex. 5–15 min).
- FR21: Le système peut envoyer un rappel avant expiration (ex. T-2 min) et expirer la réservation à T=0.
- FR22: Le système peut promouvoir automatiquement le premier en file lorsque une réservation expire.
- FR41: Photo vendeur liée au dernier code créé/édité dans une fenêtre (ex. 2 min) ; sinon bot demande « Envoie d'abord CODE PRIX ».
- FR42: Code inexistant : message clair + exemple ; typo (ex. A12A) : parsing tolérant + suggestion.
- FR44: Sans acompte = réservation « soft » TTL court ; avec acompte = réservation « locked » TTL normal.

**Orders, Proofs & États de paiement**
- FR23: Le système recommande un acompte ; sans acompte = réservation non verrouillée (TTL court) ; avec acompte = verrouillée (TTL normal).
- FR43: États de paiement minimum : no_deposit / deposit_pending / deposit_approved / deposit_rejected ; paiement à la livraison = défaut.
- FR24: Le système peut créer une commande avec un numéro unique (ex. SS-XXXX) à partir d'une réservation confirmée.
- FR25: Le système peut gérer les statuts de commande (ex. new → confirmed → delivered/cancelled).
- FR26: Le vendeur (ou agent) peut valider ou refuser une preuve d'acompte liée à une commande.
- FR27: Le système peut notifier le client par WhatsApp des changements de statut de sa commande.

**Dashboard & Ops**
- FR29: Le vendeur (ou agent) peut consulter la liste des commandes avec filtres et statuts.
- FR30: Le vendeur (ou agent) peut consulter un espace « preuves » (Proofs inbox) et valider/refuser les preuves.
- FR31: Le vendeur (ou agent) peut mettre à jour le statut d'une commande (prépa, livraison, livré, annulé).
- FR32: Le vendeur (ou agent) peut consulter les éléments/codes et réservations en cours pour une session de live (Live Ops minimal).
- FR33: Le vendeur (ou agent) peut libérer une réservation ou intervenir manuellement (ex. libérer pour le suivant).
- FR34: Le manager peut exporter les données (ex. commandes) en CSV.
- FR45: Le système enregistre un audit trail minimal horodaté : création item, réservation, promotion waitlist, confirmation, preuves, changements statuts, overrides.

**Subscription & Entitlements**
- FR35: Un visiteur peut consulter une landing de présentation du produit.
- FR36: Le manager (ou vendeur) peut gérer l'abonnement / les entitlements du tenant (même manuel en MVP).

**Ops & Support**
- FR37: L'ops SnapSell peut consulter les logs d'événements (avec correlationId) pour un tenant ou un message.
- FR38: L'ops SnapSell peut consulter une file d'erreurs (ex. media non attaché, envoi échoué) pour diagnostiquer les incidents.
- FR46: Scope opt-out (STOP) : scope = tenant ; définir quels messages restent autorisés après STOP (transactionnels stricts vs aucun).

**Total FRs : 46**

### NonFunctional Requirements

**Performance**
- NFR-P1: Temps message client (code) → réponse bot (réservé / file / expiré) : P95 < 2 s (charge MVP, ex. 1 live actif par tenant).
- NFR-P2: Réservation créée → commande confirmée (OUI + adresse) : médiane < 5 min processus ; système met à jour commande en < 10 s après réception message.
- NFR-P3: Webhook Twilio : réponse HTTP 200 sans bloquer au-delà de 1 s ; traitement lourd asynchrone après accusé.
- NFR-P4: Dashboard web (liste commandes, Proofs inbox, Live Ops) : données à jour avec délai acceptable en MVP (polling ex. 30–60 s) ; pas de temps réel Phase 1.

**Security**
- NFR-S1: Données sensibles (numéros, adresses, preuves) : accès strictement limité par tenant ; aucun accès cross-tenant.
- NFR-S2: Données sensibles chiffrées au repos et en transit (HTTPS, chiffrement stockage).
- NFR-S3: Vérification de signature des webhooks Twilio pour rejeter les requêtes non authentiques.
- NFR-S4: Si applicable (RGPD) : consentement, droit d'accès/suppression, rétention définie ; traçabilité minimale preuves et commandes.

**Integration & Reliability**
- NFR-I1: Webhook entrant traité avec idempotence (MessageSid + tenant_id) ; aucun message perdu par non-idempotence.
- NFR-I2: Messages sortants : outbox + retries + backoff + DLQ après échec répété ; aucun message « perdu » sans traçabilité (log + file erreurs).
- NFR-I3: Indisponibilité Twilio/webhook : retries Twilio côté fournisseur ; côté SnapSell pas de perte de données déjà persistées.
- NFR-R1: Disponibilité cible MVP : service webhook + workers opérationnel pendant créneaux live typiques ; objectif à définir (ex. 99 % 8h–24h).

**Scalability**
- NFR-SC1: MVP : au moins 10–20 tenants actifs hebdo, 1 live actif par tenant, volume messages compatible limites Twilio (ex. quelques centaines/heure par tenant).
- NFR-SC2: Post-MVP : conception permettant montée en charge (workers horizontaux, Redis/broker) sans refonte majeure.

**Total NFRs : 12**

### Additional Requirements

**Architecture (technique)**
- **Stack plateformes (web-first, archi §11) :** Vercel (web + webhook léger) + Neon (Postgres) + Upstash (Redis/BullMQ) + Railway (workers) + Cloudflare R2 (médias) + Sentry (observabilité). Webhook &lt; 1 s sur Vercel ; métier, outbox, cron sur Railway.
- **Starter template :** Create T3 App (`npm create t3-app@latest`) — Prisma, Tailwind, App Router ; première priorité d'implémentation = initialiser le projet avec cette commande, puis ajouter couche workers (BullMQ + Redis) et route webhook Twilio.
- **Messaging provider-agnostic (archi §7.1) :** interface MessagingProvider (parse inbound → types normalisés, send via outbox) ; idempotence sur (tenant_id, provider_message_id) ; métier indépendant du BSP (MVP Twilio, bascule Meta/autre possible).
- Webhook entrant : verify signature + idempotence check + persist MessageIn + enqueue job (payload normalisé) → réponse 200 < 1 s sur Vercel ; logique métier dans workers (Railway).
- Idempotence : unique (tenant_id, provider_message_id) sur messages_in ; clés idempotentes pour réservation et confirmation.
- Concurrence : transactions Postgres, SELECT FOR UPDATE sur live_item, contraintes uniques (code, message_sid).
- Stock préparé : reserved_qty / available_qty ; réservation = reserved_qty += 1 ; confirmation = reserved_qty -= 1, available_qty -= 1 ; expiration = reserved_qty -= 1.
- Live session auto : current_live_session = active + last_activity_at > now - INACTIVITY_WINDOW (30–60 min) ; création au premier code client ou première action vendeur ; job de fermeture.
- Outbox + DLQ en DB (message_outbox, dead_letter_jobs) ; event_log pour audit (event_type, entity_type, entity_id, correlation_id, actor_type, payload).
- Stack : Prisma, Prisma Migrate (dev/deploy + seed), Zod (tRPC + webhook + jobs), Redis pour BullMQ uniquement (pas de cache applicatif MVP).

**UX (implémentation)**
- Design system : **shadcn/ui + Tailwind** comme base pour toutes les interfaces (formulaires, inscription/connexion, dashboard, console ops). Utiliser les composants shadcn (Input, Button, Label, Card, etc.) pour cohérence et accessibilité.
- Composants spécifiques : OrderRowWithProof, LiveOpsSessionView, StatusBadge, ProofsInboxFilter.
- Même vocabulaire de statuts (réservé, confirmé, livré, expiré) sur WhatsApp et web.
- Accessibilité : WCAG 2.1 Level AA ; contraste, focus clavier, labels ; statuts avec icône + texte (pas couleur seule).
- Responsive : desktop prioritaire (dashboard) ; tablette et mobile en consultation ; breakpoints 768px, 1024px.

**PRD / Compliance**
- Isolation tenant à toutes les couches ; pas d'API publique en MVP.
- RGPD si applicable ; traçabilité commandes et preuves pour litiges.

### FR Coverage Map

- FR1–FR5: Epic 1 – Inscription, connexion et configuration vendeur
- FR6–FR10, FR39: Epic 2 – Réception et envoi WhatsApp + session live
- FR11–FR17, FR40, FR41: Epic 3 – Prix, codes et produits (FR41 = photo vendeur → dernier code, enrichissement produit)
- FR18–FR23, FR42, FR44, FR43: Epic 4 – Réservation et confirmation client
- FR24–FR27: Epic 5 – Commandes et preuves d'acompte
- FR29–FR34, FR45: Epic 6 – Dashboard commandes et Live Ops
- FR35, FR36: Epic 7A – Landing et abonnement (go-to-market)
- FR37, FR38, FR46: Epic 7B – Ops console (logs, file d'erreurs, DLQ, scope STOP)
- (Vision Product Brief – catalogue, ventes hors live): Epic 8 – Catalogue et ventes hors live
- (Vision Expérience conversationnelle): Epic 13 – Conversations naturelles et prise de main vendeur

## Epic List

### Epic 1 : Inscription, connexion et configuration vendeur

**Inscription :** Le vendeur peut s'inscrire et créer un tenant (espace isolé).

**Connexion :** Le vendeur (ou manager, agent) peut se connecter au dashboard (authentification / login) pour accéder à son espace.

**Configuration :** Le vendeur (ou manager) peut configurer la grille catégories→prix (ex. A, B, C → montants), les frais de livraison (optionnel), et connecter un numéro WhatsApp (Twilio) à son tenant ; le manager peut inviter un agent et lui donner accès au dashboard (commandes, proofs).

**FRs couverts :** FR1, FR2, FR3, FR4, FR5

**Valeur livrée :** Un vendeur peut s'inscrire, se connecter et avoir un espace prêt pour vendre (tenant, prix, livraison, WhatsApp, délégation agent).

#### Story 1.1 : Initialiser le projet (T3 App, Prisma, structure de base)

En tant que **développeur**,  
je veux **initialiser le projet SnapSell avec Create T3 App (Prisma, Tailwind, App Router) et un schéma Prisma minimal (tenant, user)**,  
afin que **le projet démarre et que l'inscription puisse persister un tenant et un utilisateur**.

**Critères d'acceptation :**

**Given** aucun projet SnapSell existant  
**When** je lance `npm create t3-app@latest` avec Prisma, Tailwind, App Router et j'ajoute les modèles Prisma `Tenant` et `User` (avec relation tenant_id sur User)  
**Then** le projet démarre (`npm run dev`), la base de données peut recevoir des tenants et des users, et la structure src/app, src/server, prisma est en place  
**And** le fichier .env.example documente DATABASE_URL

#### Story 1.2 : Inscription vendeur (création de compte et tenant)

En tant que **vendeur**,  
je veux **m'inscrire et créer mon espace (tenant)**  
afin que **j'aie un espace isolé pour vendre**.

**Critères d'acceptation :**

**Given** une page ou un flux d'inscription (email/mot de passe ou équivalent)  
**When** je remplis les champs requis et je soumets  
**Then** un tenant et un user (rôle vendeur/owner) sont créés en base, associés  
**And** je peux me connecter au dashboard (session créée)  
**And** FR1 couvert

#### Story 1.3 : Connexion au dashboard (authentification)

En tant que **vendeur, manager ou agent**,  
je veux **me connecter au dashboard**  
afin que **j'accède à mon espace (tenant) de façon sécurisée**.

**Critères d'acceptation :**

**Given** un compte existant (user + tenant)  
**When** je saisis mes identifiants et je me connecte  
**Then** une session est créée et je suis redirigé vers le dashboard  
**And** toutes les requêtes côté dashboard sont filtrées par mon tenant_id (isolation tenant)  
**And** je peux me déconnecter

#### Story 1.4 : Configurer la grille catégories→prix

En tant que **vendeur ou manager**,  
je veux **configurer une grille catégories→prix (ex. A, B, C → montants)**  
afin que **le prix soit appliqué automatiquement à partir de la lettre du code**.

**Critères d'acceptation :**

**Given** je suis connecté au dashboard de mon tenant  
**When** j'accède à la configuration et je saisis les montants par catégorie (ex. A = 5000, B = 10000, C = 15000)  
**Then** la grille est enregistrée pour mon tenant et utilisée pour le calcul du prix à partir du code (FR11)  
**And** FR2 couvert

#### Story 1.5 : Configurer les frais de livraison (optionnel)

En tant que **vendeur ou manager**,  
je veux **configurer les frais de livraison (optionnel)**  
afin que **ils soient pris en compte dans le total ou les règles métier si besoin**.

**Critères d'acceptation :**

**Given** je suis connecté au dashboard de mon tenant  
**When** j'accède à la configuration livraison et je saisis un montant ou une règle (optionnel)  
**Then** la configuration est enregistrée pour mon tenant  
**And** FR3 couvert

#### Story 1.6 : Connecter WhatsApp (Twilio) au tenant

En tant que **vendeur**,  
je veux **connecter un numéro WhatsApp (Twilio) à mon tenant**  
afin que **les messages entrants et sortants passent par SnapSell pour mon espace**.

**Critères d'acceptation :**

**Given** je suis connecté au dashboard et Twilio est configuré côté SnapSell (compte, webhook URL)  
**When** je saisis ou lie mon numéro WhatsApp / SID Twilio pour mon tenant  
**Then** le tenant est associé à ce numéro ; les messages entrants sont attribués à ce tenant (FR6)  
**And** FR4 couvert

#### Story 1.7 : Inviter un agent (manager)

En tant que **manager**,  
je veux **inviter un agent et lui donner accès au dashboard (commandes, proofs)**  
afin que **l'agent puisse gérer les commandes et les preuves sans accès à la config globale**.

**Critères d'acceptation :**

**Given** je suis connecté en tant que manager/owner du tenant  
**When** j'envoie une invitation (email ou lien) à un agent avec le rôle « agent »  
**Then** l'agent peut s'inscrire/se connecter et accéder au dashboard limité aux commandes et proofs (pas la config grille/WhatsApp/abonnement)  
**And** FR5 couvert

---

### Epic 2 : Réception et envoi de messages WhatsApp (webhook + session live)

Le système reçoit les messages WhatsApp (webhook), les attribue au bon tenant, distingue vendeur/client, traite de façon idempotente, envoie les sortants via outbox+DLQ, respecte le STOP ; la session live se crée et se ferme automatiquement.

**Design provider-agnostic (archi §7.1) :** l’implémentation utilise une interface MessagingProvider et des types normalisés (InboundMessage, outbox) ; le métier (réservation, file, stock) ne dépend pas du BSP. MVP = Twilio ; bascule possible vers Meta Cloud API ou autre BSP sans réécrire le métier.

**Audit trail (Event Log minimal) :** dès cet epic — événements `webhook_received`, `message_sent`, `idempotent_ignored` (correlationId) pour traçabilité des premiers lives.

**FRs couverts :** FR6, FR7, FR8, FR9, FR10, FR39

#### Story 2.1 : Route webhook (réception, vérif signature, idempotence, 200 < 1 s)

En tant que **système**,  
je veux **recevoir les messages WhatsApp via le webhook (MVP : Twilio), vérifier la signature, vérifier l'idempotence (tenant_id, provider_message_id), persister MessageIn et enqueue un job**,  
afin que **aucun message ne soit perdu et que la réponse 200 soit envoyée en moins de 1 s**.

**Critères d'acceptation :**

**Given** une requête POST vers la route webhook (MVP : `/api/webhooks/twilio`)  
**When** la signature est valide et (tenant_id, provider_message_id) n'existe pas encore en base  
**Then** MessageIn est persisté, un job est enqueué (payload normalisé : tenantId, providerMessageId, from, body, correlationId), et la réponse HTTP 200 est envoyée en < 1 s  
**And** la route délègue à un adapteur BSP qui produit ce payload normalisé ; le worker métier ne consomme que ces champs (pas de types SDK BSP)  
**And** si (tenant_id, provider_message_id) existe déjà, 200 sans retraitement (FR8)  
**And** FR6, FR8, NFR-P3 couverts

#### Story 2.2 : Attribuer le message au tenant et router vendeur vs client

En tant que **système**,  
je veux **attribuer chaque message entrant au bon tenant et distinguer un message vendeur d'un message client**  
afin que **le traitement (création item vs réservation) soit correct**.

**Critères d'acceptation :**

**Given** un message entrant normalisé (from, body, tenantId identifié via config tenant / numéro BSP)  
**When** le worker traite le job  
**Then** le tenant_id est connu ; si le numéro from fait partie des seller_phone(s) du tenant, le message est traité comme vendeur, sinon comme client (FR7)  
**And** FR7 couvert

#### Story 2.3 : Event Log minimal (webhook_received, message_sent, idempotent_ignored)

En tant que **système**,  
je veux **enregistrer dans l'Event Log les événements webhook_received, message_sent, idempotent_ignored avec correlationId**  
afin que **la traçabilité des premiers lives soit disponible**.

**Critères d'acceptation :**

**Given** un message entrant ou sortant traité  
**When** le webhook est reçu ou un message est envoyé (ou ignoré pour idempotence)  
**Then** un enregistrement est écrit dans event_log (event_type, entity_type, entity_id, correlation_id, payload minimal)  
**And** pas de données sensibles brutes dans le payload

#### Story 2.4 : Envoi sortant via outbox + retries + DLQ

En tant que **système**,  
je veux **envoyer les messages sortants WhatsApp via une outbox (MessageOut), avec retries et DLQ en cas d'échec**  
afin qu'**aucun message sortant ne soit perdu sans traçabilité**.

**Critères d'acceptation :**

**Given** un message à envoyer (notification, rappel, statut) en payload normalisé (to, body, tenantId, correlationId)  
**When** le worker outbound traite l'outbox  
**Then** le message est écrit en outbox (status pending), puis envoyé via l'adapteur MessagingProvider (MVP : Twilio) ; en cas d'échec, retries avec backoff ; après N échecs, envoi en DLQ (FR9, NFR-I2)  
**And** le worker outbound appelle uniquement l'interface MessagingProvider.send ; aucune dépendance directe au SDK BSP dans le métier  
**And** FR9 couvert

#### Story 2.5 : Respect du STOP (scope tenant)

En tant que **système**,  
je veux **respecter la demande STOP du client (scope = tenant)**  
afin que **le client ne reçoive plus de messages non autorisés après STOP**.

**Critères d'acceptation :**

**Given** un client a envoyé STOP sur le numéro du tenant  
**When** le système prépare un message sortant vers ce numéro (hors messages transactionnels stricts si définis)  
**Then** le message n'est pas envoyé (ou selon la règle produit : transactionnels stricts uniquement) (FR10, FR46)  
**And** FR10 couvert

#### Story 2.6 : Création et fermeture automatiques de la session live

En tant que **système**,  
je veux **créer automatiquement une live_session active au premier signal « live » (création item vendeur ou 1ère réservation client) et la fermer après inactivité**  
afin que **le vendeur n'ait pas à actionner LIVE ON/OFF**.

**Critères d'acceptation :**

**Given** un tenant sans session active  
**When** le vendeur crée un item (code) ou un client envoie un code pour réserver  
**Then** une live_session active est créée et last_activity_at est mis à jour à chaque message pertinent (FR39)  
**And** un job périodique ferme les sessions dont last_activity_at < now - INACTIVITY_WINDOW (ex. 30–60 min)  
**And** FR39 couvert

---

### Epic 3 : Prix, codes et produits (grille, unicité, stock préparé)

Le système applique le prix au code via la grille catégorie→prix, garantit l'unicité du code par session, gère codes libres et « code déjà utilisé » ; traite article unique et stock préparé (blocage à la réservation, décrément à la confirmation, concurrence). **Photo vendeur → dernier code (FR41) :** une photo envoyée par le vendeur est liée au dernier code créé/édité dans une fenêtre (ex. 2 min) ; sinon le bot demande « Envoie d'abord CODE PRIX » — enrichissement produit / item, pas checkout client.

**FRs couverts :** FR11, FR12, FR13, FR14, FR15, FR16, FR17, FR40, FR41

#### Story 3.1 : Appliquer le prix au code via la grille catégorie→prix

En tant que **système**,  
je veux **appliquer un prix à un code à partir de la lettre du code et de la grille catégories→prix du tenant**  
afin que **le prix soit dérivé automatiquement sans saisie en live**.

**Critères d'acceptation :**

**Given** un code (ex. A12) et la grille du tenant (ex. A = 5000, B = 10000)  
**When** le système calcule le prix du code  
**Then** le prix retourné est celui de la catégorie A (FR11)  
**And** FR11 couvert

#### Story 3.2 : Unicité du code par (tenant_id, live_session_id, code)

En tant que **système**,  
je veux **garantir l'unicité d'un code dans (tenant_id, live_session_id, code)**  
afin qu'**un même code ne désigne qu'un seul item par session**.

**Critères d'acceptation :**

**Given** une live_session active et un code déjà créé (ex. A12) dans cette session  
**When** le vendeur tente de créer à nouveau A12 ou le système enregistre un item  
**Then** la contrainte UNIQUE (tenant_id, live_session_id, code) est respectée ; si doublon, le bot répond « Code déjà utilisé, choisis un autre ou envoie MODIF A12 … » (FR12, FR40)  
**And** FR12, FR40 couverts

#### Story 3.3 : Créer un item unique (code non préparé, quantité 1)

En tant que **vendeur**,  
je veux **utiliser un code au format libre (ex. A12, B7) sans catalogue préalable**  
afin que **l'article soit traité comme unique (quantité 1)**.

**Critères d'acceptation :**

**Given** une session live active et une grille catégories→prix  
**When** un client réserve un code qui n'a pas été enregistré en stock préparé  
**Then** le système crée un live_item avec quantité 1 (article unique) et applique le prix via la lettre du code (FR13, FR14)  
**And** FR13, FR14 couverts

#### Story 3.4 : Enregistrer du stock préparé via WhatsApp (CODE xQTE, photo optionnelle)

En tant que **vendeur**,  
je veux **enregistrer du stock préparé sur WhatsApp (CODE xQTE + photo optionnelle + tailles optionnelles)**  
afin que **le stock soit décrémenté à la confirmation et pas à la réservation**.

**Critères d'acceptation :**

**Given** je suis reconnu comme vendeur et j'envoie un message du type « A12 x5 » (et optionnellement une photo)  
**When** le worker traite le message  
**Then** un live_item (ou prepared_stock) est créé avec code A12, quantité 5, et optionnellement media lié ; la quantité est en available_qty (FR15)  
**And** FR15 couvert

#### Story 3.5 : Photo vendeur → dernier code (fenêtre 2 min)

En tant que **système**,  
je veux **lier une photo envoyée par le vendeur au dernier code créé/édité dans une fenêtre (ex. 2 min)**  
afin que **le produit soit enrichi sans commande explicite**.

**Critères d'acceptation :**

**Given** le vendeur a créé ou édité un code dans les 2 dernières minutes  
**When** le vendeur envoie une photo  
**Then** la photo est attachée à ce dernier code (FR41)  
**And** si aucun code récent, le bot répond « Envoie d'abord CODE PRIX »  
**And** FR41 couvert

#### Story 3.6 : Blocage à la réservation (reserved_qty), décrément à la confirmation

En tant que **système**,  
je veux **bloquer une unité à la réservation (reserved_qty += 1) et décrémenter à la confirmation (reserved_qty -= 1, available_qty -= 1)**  
afin qu'**il n'y ait pas de surbooking ni de décrément avant confirmation**.

**Critères d'acceptation :**

**Given** un item en stock préparé avec available_qty > 0  
**When** un client réserve → reserved_qty += 1 ; quand il confirme (OUI + adresse) → reserved_qty -= 1, available_qty -= 1 ; si la réservation expire → reserved_qty -= 1 uniquement (FR16, FR17)  
**Then** les contraintes available_qty >= 0 et cohérence reserved_qty sont respectées ; en cas de concurrence sur le dernier stock, une seule confirmation gagne (transaction atomique)  
**And** FR16, FR17 couverts

---

### Epic 4 : Réservation et confirmation client (file, TTL, acompte)

Le client peut réserver un article (code), fournir son adresse, confirmer (OUI) ; le système gère la file, le TTL, le rappel, l'expiration et la promotion auto ; gère code inexistant/typo (FR42) ; applique la règle acompte (soft/locked) (FR44, FR43).

**Audit trail (Event Log) :** extension dès cet epic — événements `reservation_started`, `reservation_expired`, `waitlist_promoted` (correlationId) pour traçabilité du tunnel client.

**FRs couverts :** FR18, FR19, FR20, FR21, FR22, FR23, FR42, FR44, FR43

#### Story 4.1 : Réserver un article (code) et fournir l'adresse

En tant que **cliente**,  
je veux **réserver un article en envoyant le code puis fournir mon adresse**  
afin que **ma réservation soit enregistrée et que le système puisse me demander de confirmer (OUI)**.

**Critères d'acceptation :**

**Given** un code valide (item dispo ou en file)  
**When** j'envoie le code sur WhatsApp  
**Then** le système répond immédiatement (réservé / file #N / épuisé) avec timer (FR18)  
**And** si réservé, le bot me demande mon adresse ; quand j'envoie l'adresse, le bot envoie le récap prix + total + « Réponds OUI pour confirmer »  
**And** FR18 couvert

#### Story 4.2 : Code inexistant ou typo (message clair + suggestion)

En tant que **cliente**,  
je veux **recevoir un message clair si j'envoie un code inexistant ou une typo**  
afin que **je puisse corriger sans blocage**.

**Critères d'acceptation :**

**Given** j'envoie un code inexistant (ex. A12 absent) ou une typo (ex. A12A)  
**When** le worker traite le message  
**Then** le bot répond « Code inconnu (ex: A12). Vérifie et renvoie. » ou parsing tolérant + suggestion (FR42)  
**And** FR42 couvert

#### Story 4.3 : File d'attente et promotion automatique à l'expiration

En tant que **système**,  
je veux **placer le client en file d'attente si l'article est déjà réservé, appliquer un TTL à la réservation, et promouvoir automatiquement le premier en file à l'expiration**  
afin que **l'ordre soit respecté et qu'aucune place ne reste bloquée indéfiniment**.

**Critères d'acceptation :**

**Given** un item déjà réservé par un autre client  
**When** un client envoie le code → il est placé en file (#N) ; quand la réservation en tête expire (T=0), le premier en file est promu automatiquement (FR19, FR20, FR21, FR22)  
**Then** les événements reservation_started, reservation_expired, waitlist_promoted sont enregistrés dans l'Event Log (correlationId)  
**And** FR19, FR20, FR21, FR22 couverts

#### Story 4.4 : Rappel T-2 min avant expiration

En tant que **système**,  
je veux **envoyer un rappel au client T-2 min avant l'expiration de sa réservation**  
afin qu'**il ait le temps de confirmer ou de fournir son adresse**.

**Critères d'acceptation :**

**Given** une réservation active avec TTL (ex. 10 min)  
**When** il reste 2 min avant expiration  
**Then** le bot envoie un rappel au client (via outbox)  
**And** cohérent avec FR21

#### Story 4.5 : Règle acompte (soft/locked) et états de paiement

En tant que **système**,  
je veux **appliquer la règle acompte : sans acompte = réservation « soft » TTL court ; avec acompte = réservation « locked » TTL normal**  
afin de **réduire les réservations fantômes**.

**Critères d'acceptation :**

**Given** une réservation confirmée (OUI + adresse)  
**When** l'acompte est activé pour le tenant → le système demande la preuve d'acompte ; états no_deposit / deposit_pending / deposit_approved / deposit_rejected (FR23, FR44, FR43)  
**Then** la commande reste en « confirmed_pending_deposit » jusqu'à validation ou refus de la preuve ; TTL acompte (ex. 15–30 min) applicable  
**And** FR23, FR44, FR43 couverts

---

### Epic 5 : Commandes et preuves d'acompte

Le système crée une commande (SS-XXXX) à partir d'une réservation confirmée, gère les statuts (new → confirmed → delivered/cancelled), permet au vendeur/agent de valider ou refuser les preuves d'acompte, et notifie la cliente par WhatsApp.

**FRs couverts :** FR24, FR25, FR26, FR27

#### Story 5.1 : Créer une commande (SS-XXXX) à partir d'une réservation confirmée

En tant que **système**,  
je veux **créer une commande avec un numéro unique (ex. SS-XXXX) à partir d'une réservation confirmée (OUI + adresse)**  
afin que **chaque vente soit tracée**.

**Critères d'acceptation :**

**Given** une réservation confirmée (client a envoyé OUI + adresse)  
**When** le worker traite la confirmation  
**Then** une commande est créée avec numéro unique (SS-XXXX), statut new/confirmed selon config acompte (FR24)  
**And** FR24 couvert

#### Story 5.2 : Gérer les statuts de commande (new → confirmed → delivered/cancelled)

En tant que **système**,  
je veux **gérer les statuts de commande (new → confirmed → delivered/cancelled)**  
afin que **le vendeur et la cliente voient l'état de la commande**.

**Critères d'acceptation :**

**Given** une commande créée  
**When** le vendeur/agent met à jour le statut (prépa, livraison, livré, annulé)  
**Then** le statut est persisté et reflété côté dashboard et (si notif activée) côté cliente (FR25)  
**And** FR25 couvert

#### Story 5.3 : Valider ou refuser une preuve d'acompte

En tant que **vendeur ou agent**,  
je veux **valider ou refuser une preuve d'acompte liée à une commande**  
afin que **la commande passe en « confirmée » ou que la cliente soit notifiée du refus**.

**Critères d'acceptation :**

**Given** une commande en « confirmed_pending_deposit » avec une preuve (image/texte) reçue  
**When** le vendeur/agent valide ou refuse la preuve dans le dashboard  
**Then** le statut de la preuve est mis à jour (approved/rejected) et la commande passe en confirmed si approuvée ; la cliente est notifiée par WhatsApp (FR26)  
**And** FR26 couvert

#### Story 5.4 : Notifier la cliente par WhatsApp des changements de statut

En tant que **système**,  
je veux **notifier la cliente par WhatsApp des changements de statut de sa commande (confirmé, livré, etc.)**  
afin qu'**elle soit informée sans relancer**.

**Critères d'acceptation :**

**Given** une commande dont le statut change (confirmé, livré, annulé)  
**When** le statut est mis à jour  
**Then** un message de notification est écrit en outbox et envoyé à la cliente (FR27)  
**And** FR27 couvert

---

### Epic 6 : Dashboard commandes et Live Ops

Le vendeur (ou agent) consulte la liste des commandes avec filtres et statuts, l'espace preuves (Proofs inbox), met à jour les statuts (prépa, livraison, livré, annulé), consulte la session live en cours (éléments, réservations) et peut libérer une réservation ; le manager peut exporter en CSV.

**Audit trail :** l'Event Log minimal est déjà en place (Epic 2 + Epic 4). Cet epic fournit l'**affichage, filtres et export** (FR45) des événements et de l'audit trail côté dashboard — pas la création des événements.

**FRs couverts :** FR29, FR30, FR31, FR32, FR33, FR34, FR45

#### Story 6.1 : Liste des commandes avec filtres et statuts

En tant que **vendeur ou agent**,  
je veux **consulter la liste des commandes avec filtres (statut, date) et statuts**  
afin que **je voie ce qui est à préparer et à livrer**.

**Critères d'acceptation :**

**Given** je suis connecté au dashboard de mon tenant  
**When** j'accède à la vue Commandes  
**Then** je vois la liste des commandes (SS-XXXX, code, statut, client, etc.) avec filtres par statut et date (FR29)  
**And** FR29 couvert

#### Story 6.2 : Proofs inbox (preuves à valider dans le flux)

En tant que **vendeur ou agent**,  
je veux **consulter l'espace preuves (Proofs inbox) et valider/refuser les preuves d'acompte**  
afin que **les preuves soient traitées au même endroit que les commandes**.

**Critères d'acceptation :**

**Given** des commandes avec preuve en attente  
**When** j'accède à la liste commandes (ou filtre « Preuve en attente »)  
**Then** je vois les lignes avec preuve à valider et je peux cliquer Valider / Refuser (FR30)  
**And** FR30 couvert

#### Story 6.3 : Mettre à jour le statut d'une commande (prépa, livraison, livré, annulé)

En tant que **vendeur ou agent**,  
je veux **mettre à jour le statut d'une commande (prépa, livraison, livré, annulé)**  
afin que **la commande progresse jusqu'à livraison**.

**Critères d'acceptation :**

**Given** une commande dans la liste  
**When** je sélectionne un nouveau statut (prépa, livraison, livré, annulé)  
**Then** le statut est mis à jour en base et la cliente est notifiée si configuré (FR31)  
**And** FR31 couvert

#### Story 6.4 : Live Ops (session en cours, réservations, libérer)

En tant que **vendeur ou agent**,  
je veux **consulter la session live en cours (éléments/codes, réservations) et libérer une réservation si besoin**  
afin que **je garde le contrôle pendant ou après le live**.

**Critères d'acceptation :**

**Given** une session live active pour mon tenant  
**When** j'accède à la vue Live Ops  
**Then** je vois les items/codes de la session, les réservations en cours, et je peux libérer une réservation (FR32, FR33)  
**And** FR32, FR33 couverts

#### Story 6.5 : Export CSV (manager) et affichage audit trail

En tant que **manager**,  
je veux **exporter les données (ex. commandes) en CSV**  
afin que **je puisse les utiliser pour la compta ou l'analyse**.

**Critères d'acceptation :**

**Given** je suis connecté en tant que manager  
**When** je demande un export CSV (commandes, filtres optionnels)  
**Then** un fichier CSV est généré et téléchargé (FR34)  
**And** l'affichage / filtres / export de l'audit trail (Event Log) sont disponibles côté dashboard (FR45) ; la création des événements est déjà en place (Epic 2, 4)  
**And** FR34, FR45 couverts

---

### Epic 7A : Landing et abonnement (go-to-market)

Un visiteur consulte la landing ; le manager (ou vendeur) gère l'abonnement / les entitlements du tenant (client payant). Permet de livrer la landing tôt sans bloquer sur l'ops console.

**FRs couverts :** FR35, FR36

#### Story 7A.1 : Landing de présentation du produit

En tant que **visiteur**,  
je veux **consulter une landing de présentation du produit**  
afin de **découvrir SnapSell et d'être orienté vers l'inscription ou la connexion**.

**Critères d'acceptation :**

**Given** un visiteur non connecté  
**When** il accède à la racine ou à la landing  
**Then** une page de présentation du produit s'affiche avec lien vers inscription / connexion (FR35)  
**And** FR35 couvert

#### Story 7A.2 : Gérer l'abonnement / les entitlements du tenant

En tant que **manager ou vendeur**,  
je veux **gérer l'abonnement / les entitlements du tenant**  
afin que **l'accès au service soit contrôlé (même manuel en MVP)**.

**Critères d'acceptation :**

**Given** je suis connecté en tant que manager ou vendeur  
**When** j'accède à la section Abonnement / Entitlements  
**Then** je peux voir et mettre à jour l'état d'abonnement du tenant (FR36)  
**And** FR36 couvert

---

### Epic 7B : Ops console (logs, erreurs, DLQ, STOP)

L'ops SnapSell consulte les logs d'événements (correlationId) et la file d'erreurs (media non attaché, envoi échoué, DLQ) pour diagnostiquer les incidents ; le scope opt-out STOP (tenant) est défini (FR46).

**FRs couverts :** FR37, FR38, FR46

#### Story 7B.1 : Consulter les logs d'événements (correlationId)

En tant que **ops SnapSell**,  
je veux **consulter les logs d'événements (avec correlationId) pour un tenant ou un message**  
afin de **diagnostiquer les incidents**.

**Critères d'acceptation :**

**Given** je suis ops SnapSell (accès console ops)  
**When** j'accède aux logs et je filtre par tenant ou correlationId  
**Then** je vois les événements (webhook_received, message_sent, reservation_started, etc.) avec correlationId (FR37)  
**And** FR37 couvert

#### Story 7B.2 : Consulter la file d'erreurs (DLQ, media, envoi échoué)

En tant que **ops SnapSell**,  
je veux **consulter la file d'erreurs (media non attaché, envoi échoué, DLQ)**  
afin de **diagnostiquer les incidents d'envoi ou de traitement**.

**Critères d'acceptation :**

**Given** des messages en échec (outbox failed, DLQ)  
**When** j'accède à la console ops / file d'erreurs  
**Then** je vois les entrées (payload, erreur, timestamp) pour diagnostic (FR38)  
**And** FR38 couvert

#### Story 7B.3 : Définir le scope STOP (tenant) et messages autorisés après STOP

En tant que **produit / ops**,  
je veux **définir explicitement le scope opt-out STOP (tenant) et quels messages restent autorisés après STOP**  
afin que **la politique soit claire (transactionnels stricts vs aucun)**.

**Critères d'acceptation :**

**Given** un client a envoyé STOP sur le numéro du tenant  
**When** le système prépare un message sortant vers ce numéro  
**Then** la règle produit est appliquée (aucun message ou transactionnels stricts uniquement) (FR46)  
**And** FR46 couvert

---

### Epic 8 : Catalogue et ventes hors live

Le vendeur dispose d’un **catalogue persistant** (tenant) : les articles ajoutés en live et non vendus y sont automatiquement intégrés ; il peut aussi créer et gérer son catalogue depuis le dashboard sans être en live. Le **bot répond toujours** au code (réservation) sans dépendre d’une session live active : lookup par (tenant_id, code) sur le catalogue. La **session live est démarrée explicitement** par le vendeur (bouton « Lancer le live », story 8.3) ; la **création d'article à la volée** (code envoyé par une cliente mais absent du catalogue) n'a lieu **qu'en live**.

**FRs couverts :** Nouveaux besoins (vision Product Brief) — catalogue réutilisable, ventes hors live, liste des commandes déjà en place (FR29).

#### Story 8.1 : Catalogue persistant et réservation par code (tenant, code)

En tant que **cliente**,  
je veux **envoyer un code sur WhatsApp à tout moment (en live ou pas)**  
afin que **le bot réserve l’article s’il est dans le catalogue du vendeur, sans que le vendeur ait besoin d’être en live**.

**Critères d’acceptation :** Voir artefact d’implémentation `8-1-catalogue-persistant-et-reservation-par-code.md`.

#### Story 8.2 : Alimentation du catalogue (fin de session + CRUD dashboard)

En tant que **vendeur**,  
je veux **que les articles non vendus en fin de live rejoignent mon catalogue automatiquement, et pouvoir créer ou modifier mon catalogue depuis le dashboard sans être en live**  
afin que **mon catalogue soit à jour et commandable à tout moment**.

**Critères d’acceptation :** Voir artefact d’implémentation `8-2-alimentation-catalogue-fin-session-crud-dashboard.md`.

#### Story 8.3 : Lancer le live par clic (bouton dashboard)

En tant que **vendeur**,  
je veux **lancer mon live en cliquant sur un bouton dans le dashboard**  
afin que **une session live soit active uniquement quand je le décide** (pas à chaque message WhatsApp) et que la création à la volée (8.1) ne s'applique qu'en live.

**Critères d'acceptation :** Voir artefact d'implémentation `8-3-lancer-le-live-par-clic.md`.

---

### Epic 9 : Photos catalogue et nettoyage technique

Le vendeur peut **ajouter des photos** à ses articles catalogue par **deux canaux** : le **dashboard** (upload direct) et **WhatsApp** (envoi de photo avec code). Les photos sont stockées sur R2 (infra existante Stories 3.4/3.5/5.3) et servies via API sécurisée. Les **messages WhatsApp de confirmation** incluent optionnellement la photo de l'article réservé. En parallèle, la **dette technique** `CATALOGUE_SESSION_SENTINEL` est résorbée (ajout d'un vrai champ `catalogueItemId` sur Waitlist).

**FRs couverts :** Amélioration catalogue (photo produit), amélioration messaging (media sortant), nettoyage dette technique Epic 8.

#### Story 9.1 : Refactorer CATALOGUE_SESSION_SENTINEL dans Waitlist

En tant que **développeur**,
je veux **remplacer le workaround CATALOGUE_SESSION_SENTINEL par un vrai champ `catalogueItemId` sur Waitlist**
afin que **le modèle de données reflète correctement le domaine et qu'on supprime la logique sentinel fragile dans 4 fichiers**.

**Critères d'acceptation :** Voir artefact d'implémentation `9-1-refactorer-catalogue-session-sentinel.md`.

#### Story 9.2 : Upload photo catalogue via Dashboard

En tant que **vendeur**,
je veux **ajouter une photo à un article du catalogue depuis le dashboard**
afin que **mes clientes voient le produit et que ma boutique soit plus attractive**.

**Critères d'acceptation :** Voir artefact d'implémentation `9-2-upload-photo-catalogue-dashboard.md`.

#### Story 9.3 : Upload photo catalogue via WhatsApp

En tant que **vendeur**,
je veux **envoyer une photo par WhatsApp avec le code d'un article catalogue pour y associer la photo**
afin que **je puisse alimenter mes photos depuis mon téléphone, sans passer par le dashboard**.

**Critères d'acceptation :** Voir artefact d'implémentation `9-3-upload-photo-catalogue-whatsapp.md`.

#### Story 9.4 : Photo dans les messages WhatsApp de confirmation

En tant que **cliente**,
je veux **recevoir la photo de l'article dans le message WhatsApp de confirmation de réservation**
afin que **je puisse vérifier visuellement que c'est bien le bon article**.

---

### Epic 10 : Migration Twilio → Meta WhatsApp Cloud API

**Remplacement complet** de Twilio par l'API Meta WhatsApp Cloud. Chaque tenant dispose de **son propre numéro WhatsApp Business**. L'architecture provider-agnostic (§7.1) déjà en place permet de créer un `MetaCloudAdapter` et de supprimer Twilio sans toucher au business logic.

**Phase 1 (cet epic) :** remplacement Twilio → Meta, credentials saisis via page settings tenant, suppression de Twilio.
**Phase 2 (futur epic) :** devenir **Solution Provider Meta** — Embedded Signup, onboarding tenant automatique via OAuth, gestion centralisée des WABAs. Zéro config manuelle pour les tenants.

**Source :** `docs/migration-twilio-meta-whatsapp.md`

**FRs impactés :** FR4 (connexion WhatsApp → Meta au lieu de Twilio), FR6 (réception webhook Meta), FR9 (envoi sortant via Meta)

**Page existante :** `src/app/(dashboard)/parametres/whatsapp/` — actuellement 1 champ (numéro WhatsApp Twilio). Sera transformée pour les credentials Meta.

#### Story 10.1 : Env vars Meta + champs Prisma sur Tenant + page settings « Connexion WhatsApp »

En tant que **vendeur ou manager**,
je veux **configurer ma connexion WhatsApp Business Meta depuis la page Paramètres → Connexion WhatsApp, en saisissant mon Phone Number ID, WABA ID et Access Token**,
afin que **mon tenant soit connecté à mon propre numéro WhatsApp Business via l'API Meta**.

**Critères d'acceptation :**

**Given** la page `parametres/whatsapp` existante et le schema Prisma actuel
**When** la story est complétée
**Then** :
- `META_APP_SECRET` et `META_VERIFY_TOKEN` sont ajoutés dans `env.js` (optionnels)
- `metaPhoneNumberId` (unique, indexé), `metaWabaId` et `metaAccessToken` sont ajoutés au model Tenant ; migration Prisma passe sans erreur
- La page `parametres/whatsapp` est transformée : les 3 champs Meta remplacent l'ancien champ numéro Twilio (Phone Number ID, WABA ID, Access Token)
- Le formulaire sauvegarde les 3 valeurs en base via tRPC (`settings.setWhatsAppConfig` mis à jour)
- Le badge « Connecté / Déconnecté » reflète la présence des 3 champs Meta renseignés
- Le champ Access Token est masqué (type password) avec un bouton afficher/masquer
- Les champs Twilio existants ne sont pas encore supprimés (suppression dans 10.6)

#### Story 10.2 : MetaCloudAdapter (send + parseInbound + verifySignature)

En tant que **système**,
je veux **un `MetaCloudAdapter implements MessagingProvider` qui envoie des messages via `POST graph.facebook.com/v21.0/{phone_number_id}/messages`, parse le payload JSON Meta entrant, et vérifie la signature HMAC-SHA256**,
afin que **le système puisse communiquer via l'API WhatsApp Meta**.

**Critères d'acceptation :**

**Given** un tenant avec `metaPhoneNumberId` et `metaAccessToken`
**When** `send()` est appelé avec un `OutboundMessage`
**Then** un `POST` est envoyé à `graph.facebook.com/v21.0/{phoneNumberId}/messages` avec le Bearer token du tenant ; `ProviderSendResult` retourné avec le `wamid` comme `providerMessageId`
**And** `parseInbound()` parse le JSON Meta (`entry[].changes[].value.messages[]`), gère le batch (plusieurs messages dans 1 POST), et retourne un `InboundMessage` normalisé par message
**And** `verifySignature()` vérifie le header `X-Hub-Signature-256` avec HMAC-SHA256 et `META_APP_SECRET`
**And** support media sortant : si `mediaUrl` présent, upload vers `/media` d'abord puis envoi avec `media_id`
**And** tests unitaires couvrent send, parseInbound (single + batch), verifySignature (valide + invalide), media upload

#### Story 10.3 : Webhook Meta (GET challenge + POST inbound) + schema Zod

En tant que **système**,
je veux **une route `/api/webhooks/meta` qui gère le challenge GET (vérification Meta) et le POST inbound (réception messages), avec un schema Zod `metaWebhookSchema`**,
afin que **Meta puisse vérifier le webhook et que les messages entrants soient traités**.

**Critères d'acceptation :**

**Given** la route `/api/webhooks/meta`
**When** Meta envoie un `GET` avec `hub.mode=subscribe`, `hub.verify_token` et `hub.challenge`
**Then** si `hub.verify_token` correspond à `META_VERIFY_TOKEN`, retourner `hub.challenge` avec status 200 ; sinon 403
**And** `POST` : vérifier signature HMAC-SHA256, parser le JSON via `metaWebhookSchema`, résoudre le tenant via `metaPhoneNumberId`, même flux (idempotence, persist MessageIn, enqueue BullMQ, réponse 200 < 1 s)
**And** schema Zod `metaWebhookSchema` ajouté dans `webhook.ts` pour valider la structure Meta (`object`, `entry[].changes[].value`)
**And** tests couvrent : challenge valide/invalide, POST single message, POST batch, tenant non trouvé, signature invalide

#### Story 10.4 : Outbox-sender — remplacer Twilio par Meta

En tant que **système**,
je veux **que l'outbox-sender utilise `MetaCloudAdapter` au lieu de `TwilioAdapter` pour envoyer les messages sortants**,
afin que **tous les messages sortants passent par l'API Meta**.

**Critères d'acceptation :**

**Given** un `messageOut` avec `tenantId`
**When** l'outbox-sender traite le message
**Then** il lit le tenant en base, récupère `metaAccessToken` et `metaPhoneNumberId`, et instancie un `MetaCloudAdapter` pour l'envoi
**And** `TwilioAdapter` n'est plus utilisé dans l'outbox-sender
**And** tests couvrent : envoi via Meta, tenant sans config Meta → erreur gracieuse

#### Story 10.6 : Supprimer Twilio (adapter, webhook, env vars, dépendance npm)

En tant que **développeur**,
je veux **supprimer tout le code Twilio : `TwilioAdapter`, route webhook `/api/webhooks/twilio`, env vars Twilio dans `env.js`, schema `twilioWebhookSchema`, champs Twilio sur Tenant, et la dépendance npm `twilio`**,
afin que **le codebase soit propre et ne dépende plus que de Meta**.

**Critères d'acceptation :**

**Given** tous les tenants utilisent Meta (stories 10.1–10.5 complétées)
**When** le nettoyage est appliqué
**Then** supprimés : `src/server/messaging/providers/twilio/` (dossier entier), `src/app/api/webhooks/twilio/` (dossier entier), `twilioWebhookSchema` dans `webhook.ts`, env vars `TWILIO_*` dans `env.js` et `.env`, champs Twilio sur Tenant dans le schema Prisma, dépendance `twilio` dans `package.json`
**And** tous les tests existants passent (0 régression) — les tests qui référençaient Twilio sont supprimés ou migrés vers Meta
**And** `npm ls twilio` ne retourne rien

---

### Epic 12 : Onboarding WhatsApp automatisé (Meta Embedded Signup)

**Vision :** Passer de 30–60 minutes de configuration manuelle (Meta Business Suite → tokens → copier-coller) à un onboarding WhatsApp en **2–3 clics** depuis le dashboard SnapSell, grâce au programme **Meta Tech Provider** et à l'**Embedded Signup**.

**Problème actuel :** Chaque nouveau tenant doit créer son WABA, générer un System User Token et copier manuellement son `Phone Number ID` + `Access Token` dans les Settings SnapSell. Cette friction technique freine l'adoption, surtout pour les vendeurs non-techniques.

**Solution :** SnapSell s'enregistre comme **Meta Tech Provider** (vérification business Meta one-shot), ce qui débloque l'**Embedded Signup** — un flow OAuth-like où le tenant connecte son WhatsApp Business sans quitter SnapSell.

**Prérequis business (hors code — à accomplir avant le développement) :**
1. Entité légale SnapSell enregistrée (RCCM ou équivalent)
2. Site web professionnel SnapSell actif
3. Vérification Meta Business (délai : 3–14 jours ouvrés)
4. Demande statut **Meta Tech Provider** approuvée (délai : quelques semaines)

**FRs couverts :** FR4 amélioré (connexion WhatsApp simplifié), amélioration onboarding tenant

#### Story 12.1 : SDK Meta Embedded Signup — bouton « Connecter WhatsApp Business »

En tant que **vendeur**,
je veux **cliquer sur un bouton « Connecter WhatsApp Business » dans la page Paramètres → Connexion WhatsApp**,
afin de **lancer le flow Meta Embedded Signup (popup OAuth Meta) sans quitter SnapSell et sans copier-coller de tokens**.

**Critères d'acceptation :**

**Given** la page `parametres/whatsapp` existante avec les champs manuels Phone Number ID / Access Token
**When** je clique sur « Connecter WhatsApp Business »
**Then** un popup Meta s'ouvre (Meta Embedded Signup SDK chargé via `window.FB`)
**And** je peux me connecter avec mon compte Meta, sélectionner ou créer mon WABA et mon numéro WhatsApp Business
**And** après autorisation, Meta renvoie un code OAuth que la page transmet au backend SnapSell
**And** les champs manuels restent disponibles en fallback pour les tenants avancés
**And** le SDK Meta est chargé conditionnellement (uniquement sur cette page, pas globalement)

#### Story 12.2 : Backend — OAuth callback Meta + stockage automatique des credentials

En tant que **système**,
je veux **recevoir le code OAuth issu de l'Embedded Signup, l'échanger contre un Access Token permanent via l'API Meta Graph, récupérer le `phone_number_id` associé, et stocker les credentials automatiquement pour le tenant**,
afin que **le tenant soit immédiatement connecté sans aucune saisie manuelle**.

**Critères d'acceptation :**

**Given** le tenant a complété le flow Embedded Signup et le frontend transmet le `code` OAuth
**When** la mutation tRPC `settings.connectWhatsAppEmbedded` est appelée avec ce code
**Then** le backend échange le code contre un token via `POST graph.facebook.com/oauth/access_token`
**And** récupère le `phone_number_id` et le `waba_id` associés via `GET graph.facebook.com/debug_token`
**And** génère un System User Token de longue durée via l'API Meta
**And** enregistre `metaPhoneNumberId`, `metaWabaId`, `metaAccessToken` sur le Tenant en base
**And** la page Settings affiche le badge « ✓ Connecté » avec le numéro WhatsApp associé
**And** les tests couvrent : échange code valide, code expiré → erreur gracieuse, permissions manquantes → message clair

#### Story 12.3 : Reconnexion guidée pour les tenants existants

En tant que **tenant existant** (credentials saisis manuellement),
je veux **une option pour reconnecter mon WhatsApp via Embedded Signup**,
afin de **migrer vers le nouveau flow sans interruption de service et bénéficier du renouvellement automatique de token**.

**Critères d'acceptation :**

**Given** un tenant avec `metaPhoneNumberId` et `metaAccessToken` déjà renseignés manuellement
**When** j'accède à la page `parametres/whatsapp`
**Then** je vois mon numéro actuel connecté et un bouton optionnel « Reconnecter via Meta (recommandé) »
**And** si je clique, le flow Embedded Signup se lance — à la fin, les credentials sont mis à jour en base
**And** si je ne reconnecte pas, les credentials manuels existants continuent de fonctionner (aucune régression)
**And** une bannière informative explique l'avantage (renouvellement auto du token, plus de configuration manuelle)

#### Story 12.4 : Tests end-to-end Embedded Signup (sandbox Meta)

En tant que **développeur**,
je veux **un test d'intégration end-to-end du flow Embedded Signup dans le sandbox Meta**,
afin que **le flow soit validé avant déploiement en production et que les régressions futures soient détectées**.

**Critères d'acceptation :**

**Given** un compte Meta Developer avec une app en mode sandbox
**When** le test d'intégration est exécuté (conditionnel : `RUN_INTEGRATION_TESTS=true`)
**Then** le flow complet est validé : popup → code OAuth → échange token → stockage credentials → badge « Connecté »
**And** les cas d'erreur sont couverts : token expiré, permissions insuffisantes, WABA suspendu
**And** le test est documenté dans `src/server/messaging/providers/meta/__tests__/embedded-signup.integration.test.ts`
**And** le README du dossier meta explique comment configurer le sandbox pour exécuter ce test

---

### Epic 13 : Conversations naturelles et prise de main vendeur

**Contexte produit :**
SnapSell automatise le traitement des messages WhatsApp pour réduire la charge du vendeur pendant ses lives et ventes. Le vendeur garde WhatsApp Business sur son téléphone comme interface principale — SnapSell est son assistant back-office, pas son interface de messagerie. Cependant, des clients posent parfois des questions hors-flux (livraison en zone X, délais, disponibilité future) auxquelles le bot ne peut pas répondre. Cet epic vise à rendre les conversations plus humaines et à permettre au vendeur de prendre la main ponctuellement sans casser le flux automatique.

**Objectif :** Les clients ne doivent pas sentir qu'ils parlent à un robot. Le vendeur peut intervenir sur un fil spécifique sans couper l'automatisation pour les autres clients.

**Valeur métier :** Fidélisation client, meilleure expérience d'achat, moins de frustration des clients bloqués sur une question sans réponse.

---

#### Story 13.1 : Humanisation des messages du bot

En tant que **client**,
je veux **recevoir des messages chaleureux et naturels** de la part du système SnapSell,
afin de **ne pas avoir l'impression de parler à un robot**.

**Critères d'acceptation :**

**Given** le bot envoie n'importe quel message automatique (confirmation réservation, demande d'adresse, confirmation commande, etc.)
**When** le message est composé
**Then** le ton est chaleureux, avec des emojis contextuels et des formulations variées
**And** pour un même événement, le bot pioche aléatoirement parmi 2-3 formulations pour éviter la répétition
**And** si le prénom du client est connu (champ `customerName` futur ou premier message), il est utilisé dans la salutation
**And** un délai de frappe simulé (Meta "typing indicator") précède l'envoi pour casser l'effet instantané/robotique
**And** les messages de confirmation incluent un récapitulatif lisible (article, prix, adresse) et non des données brutes

**Exemples de réécriture :**
- `"Réservé. Envoie ton adresse."` → `"C'est réservé pour toi ! 🎉 Pour finaliser, envoie-moi ton adresse de livraison."`
- `"Commande enregistrée."` → `"Parfait, ta commande est bien enregistrée ! On te tient au courant pour la livraison 📦"`
- `"Stock épuisé."` → `"Oups, ce produit est malheureusement épuisé 😕 Tu veux être prévenu si ça revient ?"`

---

#### Story 13.2 : Fallback humain — escalade automatique vers le vendeur

En tant que **vendeur**,
je veux **être notifié sur mon propre numéro WhatsApp quand un client pose une question que le bot ne comprend pas**,
afin de **pouvoir répondre manuellement sans avoir à surveiller le dashboard**.

**Critères d'acceptation :**

**Given** un client envoie un message qui ne correspond à aucun pattern connu (ni code article, ni adresse, ni OUI/NON, ni STOP)
**When** le worker traite ce message
**Then** le bot répond au client : `"Bonne question ! Notre équipe revient vers toi très rapidement 🙏"`
**And** SnapSell envoie une notification au numéro du vendeur (premier numéro dans `SellerPhone` du tenant) :
  `"❓ Question de [+336XXXXXX] : «[texte du message]»"`
**And** le vendeur peut répondre directement au client depuis WhatsApp Business (aucun écran SnapSell nécessaire)
**And** si le client envoie ensuite un code article ou OUI, le bot reprend automatiquement le flux normal
**And** le fallback est loggué dans `EventLog` avec `eventType = "fallback_to_human"`
**And** si aucun numéro vendeur n'est configuré dans `SellerPhone`, le fallback se limite à la réponse au client (pas d'envoi notif)

---

#### Story 13.3 : Pause bot par conversation (commande PAUSE/RESUME)

En tant que **vendeur**,
je veux **mettre le bot en pause pour un client spécifique** en tapant une commande depuis mon numéro WhatsApp,
afin de **gérer manuellement certains fils sensibles sans impacter les autres clients**.

**Critères d'acceptation :**

**Given** le vendeur envoie depuis son numéro (présent dans `SellerPhone`) : `"PAUSE +33612345678"`
**When** le worker reçoit ce message
**Then** le bot ignore tous les messages entrants du client `+33612345678` pour ce tenant (sauf STOP)
**And** le vendeur reçoit une confirmation : `"✅ Bot en pause pour +33612345678. Réponds librement. Tape RESUME +33612345678 pour réactiver."`
**And** si le client envoie un message pendant la pause, le bot ne répond pas (le vendeur gère depuis WhatsApp Business)

**Given** le vendeur envoie : `"RESUME +33612345678"`
**When** le worker reçoit ce message
**Then** le bot reprend le traitement normal des messages de ce client
**And** le vendeur reçoit une confirmation : `"✅ Bot réactivé pour +33612345678."`

**And** l'état pause/resume est persisté en base (table `ConversationPause` ou champ sur `MessageIn` context)
**And** une pause expire automatiquement après 4 heures sans activité vendeur sur ce fil
**And** les événements PAUSE/RESUME sont loggués dans `EventLog`

---

#### Story 13.4 : Pause bot automatique à la réponse manuelle du vendeur (mode intelligent)

En tant que **vendeur**,
je veux **que le bot se mette automatiquement en pause sur un client dès que je réponds manuellement à ce client**,
afin de **ne pas avoir à taper la commande PAUSE explicitement**.

**Critères d'acceptation :**

**Given** le vendeur (numéro dans `SellerPhone`) envoie un message texte libre à un client (message ne correspondant à aucun pattern de commande bot : pas CODE, pas PAUSE, pas RESUME)
**When** le worker traite ce message vendeur
**Then** le bot passe automatiquement en pause pour ce client (équivalent à `PAUSE [clientPhone]`)
**And** une pause automatique expire après 30 minutes d'inactivité vendeur sur ce fil
**And** si le client envoie ensuite un code article, le bot ne répond pas (vendeur toujours en contrôle)
**And** si la pause expire (30 min), le bot reprend automatiquement le traitement normal

**Note d'implémentation :** distinguer les messages vendeur "commande bot" (CODE, PAUSE, RESUME, etc.) des messages vendeur "réponse manuelle libre" par absence de pattern connu.

---

#### Story 13.5 : Interactions minimales par boutons (scope MVP)

En tant que **cliente**,
je veux **confirmer ou corriger rapidement une commande via boutons WhatsApp**,
afin de **repondre sans ambiguite et accelerer la conversion**.

**Criteres d'acceptation :**

**Given** une reservation en statut `address_collected` et une fenetre conversationnelle ouverte
**When** SnapSell envoie le recap de commande
**Then** le message inclut 3 actions rapides : `Confirmer`, `Corriger adresse`, `Annuler`
**And** `Confirmer` declenche la meme logique metier que le `OUI` existant
**And** `Corriger adresse` remet la conversation dans l'etape collecte adresse
**And** `Annuler` abandonne la reservation selon les regles existantes
**And** tous les clics sont loggues dans `EventLog` avec un `eventType` dedie (`interactive_action_clicked`)
**And** si l'interactif n'est pas supporte/disponible, SnapSell envoie un fallback texte equivalent (`OUI`, `CORRIGER`, `ANNULER`)

---

**Dépendances :** Epic 2 (worker webhook), Epic 3 (catalogue), table `SellerPhone` (Epic 1), Epic 10/12 (provider WhatsApp Meta)
**Priorité suggérée :** Story 13.1 → 13.2 → 13.3 → 13.4 → 13.5 (valeur croissante, complexité croissante)
**Effort estimé :** 13.1 (S), 13.2 (M), 13.3 (M), 13.4 (L), 13.5 (M)

---

### Epic 14 : Interactions WhatsApp avancees et robustesse conversationnelle

**Contexte produit :**
Apres la prise de main vendeur (Epic 13), SnapSell doit fiabiliser et standardiser les interactions WhatsApp (boutons, listes, templates hors fenetre) pour reduire les erreurs de saisie et augmenter le taux de conversion sans sortir du modele WhatsApp-first.

**Objectif :** Offrir une couche d'interactions guidees (cliente et vendeur) avec fallback texte systematique, compatible avec les contraintes de fenetre conversationnelle.

**Valeur metier :** Plus de confirmations finalisees, moins de messages ambigus, temps de traitement vendeur reduit.

**Garde-fous de coherence (epics precedents) :**
- Reutiliser l'outbox/retry/DLQ existants (Epic 2, Epic 11) ; pas de nouvelle file dediee.
- Reutiliser l'EventLog et la console ops existants (Epic 2, Epic 7B) ; pas de nouveau module analytics en MVP.
- Conserver les regles metier reservation/confirmation/acompte (Epic 4, Epic 5) ; l'interactif ne change que l'UI conversationnelle.
- Reutiliser l'integration provider Meta deja en place (Epic 10, Epic 12).

---

#### Story 14.1 : Couche de capacites de message (interactive/template/texte)

En tant que **developpeur**,
je veux **une couche unique qui decide le format d'envoi**,
afin de **eviter la duplication de logique et garantir des fallbacks coherents**.

**Criteres d'acceptation :**

**Given** un envoi sortant avec intention metier (confirmation, relance, fallback humain, statut)
**When** le moteur d'envoi prepare le message
**Then** il choisit `interactive` si possible, sinon `template` si hors fenetre, sinon `texte` en fallback
**And** la decision prise est logguee (`message_capability_selected`) avec raison (`within_window`, `outside_window`, `interactive_not_supported`, etc.)
**And** l'envoi final passe toujours par l'outbox existante (aucun bypass direct provider)
**And** les tests couvrent les 3 chemins (interactive, template, texte)

---

#### Story 14.2 : Templates hors fenetre conversationnelle (Meta)

En tant que **vendeur**,
je veux **pouvoir relancer proprement une cliente hors fenetre**,
afin de **maintenir la conversion sans erreur de conformite provider**.

**Criteres d'acceptation :**

**Given** une conversation hors fenetre
**When** SnapSell doit envoyer une relance (confirmation en attente, reprise conversation)
**Then** un template approuve Meta est utilise
**And** les variables dynamiques minimales sont injectees (code, montant, reference commande)
**And** en cas d'echec template, l'echec est loggue dans la filiere d'erreurs existante (outbox/retry/DLQ)
**And** aucun envoi non-conforme n'est tente hors fenetre

---

#### Story 14.3 : Actions rapides vendeur depuis notifications WhatsApp

En tant que **vendeur**,
je veux **declencher des actions standards sans syntaxe fragile**,
afin de **repondre plus vite pendant le live**.

**Criteres d'acceptation :**

**Given** une notification SnapSell vers vendeur (fallback humain, pause a expirer)
**When** le vendeur recoit la notification
**Then** la notification propose des actions rapides (`Prendre la main`, `Reprendre bot`, `Prolonger pause`) selon le contexte
**And** chaque action appelle la logique metier existante equivalente (`PAUSE/RESUME`) sans changer les regles fonctionnelles
**And** une alternative texte reste documentee et supportee (`PAUSE +numero`, `RESUME +numero`)
**And** l'envoi et la tracabilite passent par les mecanismes existants (outbox + EventLog)

---

#### Story 14.4 : Instrumentation conversationnelle (EventLog + console ops existante)

En tant que **manager/owner**,
je veux **mesurer l'impact des interactions guidees**,
afin de **optimiser les parcours conversationnels avec des donnees reelles**.

**Criteres d'acceptation :**

**Given** les interactions WhatsApp (boutons/listes/templates/fallbacks texte)
**When** des conversations sont traitees
**Then** SnapSell expose des metriques minimales : taux de clic interactif, taux fallback texte, taux confirmation apres recap, delai moyen confirmation
**And** les metriques sont segmentees par tenant et periode
**And** la consultation se fait via les surfaces existantes (event logs/exports ops) sans nouveau dashboard dedie
**And** les definitions sont documentees pour eviter toute ambiguite d'interpretation

---

#### Story 14.5 : Matrice exhaustive des moments conversationnels et actions rapides

En tant que **product + tech lead**,
je veux **une matrice exhaustive des issues conversationnelles SnapSell**,
afin de **garantir qu'aucun moment important ne reste sans action rapide ou fallback texte**.

**Criteres d'acceptation :**

**Given** les flux existants (reservation, file d'attente, confirmation, acompte, statuts, fallback humain, pause/reprise bot)
**When** la specification Epic 14 est finalisee
**Then** une matrice source de verite est produite (dans les artefacts planning) avec, pour chaque issue:
  - action interactive cible (boutons/liste/aucune),
  - fallback texte equivalent,
  - contraintes fenetre conversationnelle (in-session/hors-session template),
  - event log attendu
**And** toute issue sans interactif est justifiee explicitement (`non-critique`, `non-support provider`, `phase ulterieure`)
**And** la matrice est tracable vers les stories (13.5, 14.1, 14.2, 14.3, 14.4 et suivantes)

---

#### Story 14.6 : Couverture complete par vagues (sans trou fonctionnel)

En tant que **product manager**,
je veux **planifier la couverture complete des actions rapides par vagues**,
afin de **penser a tout maintenant tout en livrant de facon incrementale**.

**Criteres d'acceptation :**

**Given** la matrice exhaustive (Story 14.5)
**When** le plan de livraison est etabli
**Then** les vagues sont definies avec perimetres fermes:
  - Vague A: confirmation/reservation (cliente),
  - Vague B: fallback humain + takeover (vendeur),
  - Vague C: relances/statuts hors fenetre (templates),
  - Vague D: cas secondaires (epuise, alternatives, file d'attente avancee)
**And** chaque vague contient ses AC, ses tests et ses metriques de succes
**And** la couverture finale vise 100% des moments critiques identifies dans la matrice

---

**Dépendances :** Epic 2 (EventLog/outbox), Epic 4-5 (tunnel reservation/commande), Epic 7B (console ops), Epic 10/12 (provider Meta), Epic 11 (jobs/outbox), Epic 13 (takeover)
**Priorité suggérée :** Story 14.1 → 14.2 → 14.3 → 14.4 → 14.5 → 14.6
**Effort estimé :** 14.1 (M), 14.2 (M), 14.3 (M), 14.4 (S), 14.5 (S), 14.6 (S)
