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
- FR24: Le système peut créer une commande avec un numéro unique (ex. VF-XXXX) à partir d'une réservation confirmée.
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

Le système crée une commande (VF-XXXX) à partir d'une réservation confirmée, gère les statuts (new → confirmed → delivered/cancelled), permet au vendeur/agent de valider ou refuser les preuves d'acompte, et notifie la cliente par WhatsApp.

**FRs couverts :** FR24, FR25, FR26, FR27

#### Story 5.1 : Créer une commande (VF-XXXX) à partir d'une réservation confirmée

En tant que **système**,  
je veux **créer une commande avec un numéro unique (ex. VF-XXXX) à partir d'une réservation confirmée (OUI + adresse)**  
afin que **chaque vente soit tracée**.

**Critères d'acceptation :**

**Given** une réservation confirmée (client a envoyé OUI + adresse)  
**When** le worker traite la confirmation  
**Then** une commande est créée avec numéro unique (VF-XXXX), statut new/confirmed selon config acompte (FR24)  
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
**Then** je vois la liste des commandes (VF-XXXX, code, statut, client, etc.) avec filtres par statut et date (FR29)  
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
