---
stepsCompleted: [1, 2, 3, 4, 5, 6]
workflowType: 'implementation-readiness'
project_name: 'SnapSell'
date: '2026-02-03'
documentsIncluded:
  prd: 'prd.md'
  architecture: 'architecture.md'
  ux: ['ux-design-specification.md', 'ux-design-directions.html']
  epics: 'epics.md'
---

# Implementation Readiness Assessment Report

**Date:** 2026-02-03  
**Project:** SnapSell

---

## Step 1: Document Discovery

### PRD
- **Whole:** prd.md
- **Sharded:** aucun

### Architecture
- **Whole:** architecture.md
- **Sharded:** aucun

### Epics & Stories
- **Whole:** epics.md
- **Sharded:** aucun

### UX Design
- **Whole:** ux-design-specification.md, ux-design-directions.html
- **Sharded:** aucun

### Issues
- Aucun doublon (whole vs sharded).
- Epics & Stories : trouvé (epics.md) — couverture FR et qualité epics évaluées (steps 3 et 5).

---

## Step 2: PRD Analysis

### Functional Requirements Extracted

**Onboarding & Configuration**
- **FR1:** Le vendeur peut s'inscrire et créer un tenant (espace isolé).
- **FR2:** Le vendeur (ou manager) peut configurer une grille catégories→prix (ex. A, B, C → montants).
- **FR3:** Le vendeur (ou manager) peut configurer les frais de livraison (optionnel).
- **FR4:** Le vendeur peut connecter un numéro WhatsApp (Twilio) à son tenant.
- **FR5:** Le manager peut inviter un agent et lui donner accès au dashboard (commandes, proofs).

**WhatsApp Messaging & Routing**
- **FR6:** Le système peut recevoir des messages entrants WhatsApp (webhook) et les attribuer au bon tenant.
- **FR7:** Le système peut distinguer un message vendeur d'un message client ; les numéros vendeur = seller_phone(s) enregistrés côté tenant (pas le From ambigu).
- **FR8:** Le système peut traiter les messages de façon idempotente (éviter doublons par MessageSid + tenant).
- **FR9:** Le système peut envoyer des messages sortants WhatsApp (notifications, rappels, statuts) via outbox + retry + DLQ.
- **FR10:** Le client peut signaler l'arrêt des messages (STOP) et le système en tient compte.

**Live Session (auto)**
- **FR39:** Le système crée automatiquement une live_session active dès qu'il reçoit un signal « live » (ex. création item vendeur, ou 1ère réservation client) et qu'il n'existe aucune session active pour ce tenant. Pas besoin de commande explicite LIVE ON/OFF. Le système met à jour last_activity_at à chaque message pertinent ; la session se ferme automatiquement après une période d'inactivité (T_inactive) configurable (ex. 30–60 min) ou via un job de fermeture.

**Pricing & Codes**
- **FR11:** Le système peut appliquer un prix à un code à partir de la lettre du code et de la grille catégories→prix du tenant.
- **FR12:** Le système garantit l'unicité d'un code dans (tenant_id, live_session_id, code).
- **FR13:** Le vendeur peut utiliser des codes au format libre (ex. A12, B7) sans catalogue préalable.
- **FR40:** Si le vendeur renvoie un code déjà existant dans la session : pas d'update implicite. Le bot répond : « Code déjà utilisé, choisis un autre ou envoie MODIF A12 … » (commande MODIF en P1 si besoin).

**Products & Stock**
- **FR14:** Le système peut traiter un code non préparé comme article unique (quantité 1).
- **FR15:** Le vendeur peut enregistrer du stock préparé sur WhatsApp (prioritaire MVP) : CODE xQTE + photo optionnelle + tailles optionnelles. Enregistrement via web = optionnel MVP.
- **FR16:** Le système décrémente automatiquement le stock préparé uniquement à la confirmation de commande (pas à la réservation). Pendant la réservation, le système « bloque » sans consommer le stock.
- **FR17:** Le système empêche la confirmation si le stock est épuisé et gère la concurrence (transaction atomique, waitlist si dispo).

**Reservations & Waitlist**
- **FR18:** Le client peut réserver un article (code) puis fournir son adresse et confirmer (OUI) ; le système gère le tunnel réservation → collecte adresse → confirmation → commande. La réservation et la file d'attente s'attachent à un live_item lié à la live_session active.
- **FR19:** Le système peut placer le client en file d'attente si l'article est déjà réservé.
- **FR20:** Le système peut appliquer un TTL configurable à une réservation (ex. 5–15 min).
- **FR21:** Le système peut envoyer un rappel avant expiration (ex. T-2 min) et expirer la réservation à T=0.
- **FR22:** Le système peut promouvoir automatiquement le premier en file lorsque une réservation expire.
- **FR41:** Une photo envoyée par le vendeur est liée au dernier code créé/édité par le vendeur dans une fenêtre (ex. 2 min). Si pas de correspondance : le bot demande « Envoie d'abord CODE PRIX ».
- **FR42:** Si le client envoie un code inexistant : message clair + exemple. Si typo (ex. A12A) : parsing tolérant + suggestion.
- **FR44:** Règle anti–réservation fantôme : sans acompte = réservation « soft » TTL court ; avec acompte = réservation « locked » TTL normal. Option P1 : acompte obligatoire au-delà d'un seuil prix.

**Orders, Proofs & États de paiement**
- **FR23:** Le système recommande un acompte et peut traiter la réservation en « non verrouillée » si pas d'acompte (TTL court) ; avec acompte = réservation verrouillée (TTL normal).
- **FR43:** États de paiement minimum : no_deposit / deposit_pending / deposit_approved / deposit_rejected. Paiement à la livraison = défaut ; acompte = « lock » recommandé.
- **FR24:** Le système peut créer une commande avec un numéro unique (ex. VF-XXXX) à partir d'une réservation confirmée.
- **FR25:** Le système peut gérer les statuts de commande (ex. new → confirmed → delivered/cancelled).
- **FR26:** Le vendeur (ou agent) peut valider ou refuser une preuve d'acompte liée à une commande.
- **FR27:** Le système peut notifier le client par WhatsApp des changements de statut de sa commande.

**Dashboard & Ops**
- **FR29:** Le vendeur (ou agent) peut consulter la liste des commandes avec filtres et statuts.
- **FR30:** Le vendeur (ou agent) peut consulter un espace « preuves » (Proofs inbox) et valider/refuser les preuves.
- **FR31:** Le vendeur (ou agent) peut mettre à jour le statut d'une commande (prépa, livraison, livré, annulé).
- **FR32:** Le vendeur (ou agent) peut consulter les éléments/codes et réservations en cours pour une session de live (Live Ops minimal).
- **FR33:** Le vendeur (ou agent) peut libérer une réservation ou intervenir manuellement si besoin (ex. libérer pour le suivant).
- **FR34:** Le manager peut exporter les données (ex. commandes) en CSV.
- **FR45:** Le système enregistre un audit trail minimal horodaté : création item, réservation, promotion waitlist, confirmation, preuves, changements statuts, overrides manuels.

**Subscription & Entitlements**
- **FR35:** Un visiteur peut consulter une landing de présentation du produit.
- **FR36:** Le manager (ou vendeur) peut gérer l'abonnement / les entitlements du tenant (même manuel en MVP).

**Ops & Support**
- **FR37:** L'ops SnapSell peut consulter les logs d'événements (avec correlationId) pour un tenant ou un message.
- **FR38:** L'ops SnapSell peut consulter une file d'erreurs (ex. media non attaché, envoi échoué) pour diagnostiquer les incidents.
- **FR46:** Scope opt-out (STOP) : scope = tenant (explicite). Définir quels messages restent autorisés après STOP (transactionnels stricts vs aucun).

**Total FRs : 46** (FR1–FR46, certains avec sous-points)

### Non-Functional Requirements Extracted

**Performance**
- **NFR-P1:** Temps « message client (code) → réponse bot (réservé / file / expiré) » : P95 < 2 secondes, dans des conditions de charge MVP (ex. 1 live actif par tenant).
- **NFR-P2:** Temps « réservation créée → commande confirmée (OUI + adresse) » : médiane < 5 min côté processus métier ; le système traite la confirmation et met à jour la commande en < 10 s après réception du message.
- **NFR-P3:** Le webhook Twilio est traité de façon à ne pas bloquer l'envoi de la réponse HTTP 200 au-delà de 1 s ; le traitement lourd (réservation, file, notifications) peut être asynchrone après accusé de réception.
- **NFR-P4:** Le dashboard web (liste commandes, Proofs inbox, Live Ops) affiche les données à jour avec un délai acceptable en MVP (polling ex. 30–60 s) ; pas d'exigence temps réel en Phase 1.

**Security**
- **NFR-S1:** Données sensibles (numéros téléphone, adresses, preuves paiement) : accès strictement limité par tenant ; aucun accès cross-tenant.
- **NFR-S2:** Données sensibles chiffrées au repos et en transit (HTTPS, chiffrement stockage).
- **NFR-S3:** Vérification de signature des webhooks Twilio pour rejeter les requêtes non authentiques.
- **NFR-S4:** Si applicable (RGPD) : consentement, droit d'accès/suppression, rétention définie ; traçabilité minimale pour preuves et commandes.

**Integration & Reliability**
- **NFR-I1:** Intégration Twilio : webhook entrant traité avec idempotence (MessageSid + tenant_id) ; aucun message perdu par non-idempotence.
- **NFR-I2:** Messages sortants WhatsApp : envoi via outbox + retries avec backoff + DLQ après échec répété ; aucun message sortant « perdu » sans traçabilité (log + file erreurs).
- **NFR-I3:** En cas d'indisponibilité temporaire de Twilio ou du webhook : les messages entrants sont retentés par Twilio selon sa politique ; côté SnapSell, pas de perte de données déjà persistées (réservations, commandes).
- **NFR-R1:** Disponibilité cible MVP : le service de traitement des messages (webhook + workers) est opérationnel pendant les créneaux de live typiques ; objectif de disponibilité à définir (ex. 99 % sur plage 8h–24h) et à affiner en production.

**Scalability**
- **NFR-SC1:** MVP : le système supporte au moins 10–20 tenants actifs hebdo avec 1 live actif par tenant et un volume de messages compatible avec les limites Twilio (ex. quelques centaines de messages/heure par tenant).
- **NFR-SC2:** Post-MVP : conception permettant montée en charge (workers horizontaux, Redis/broker si besoin) sans refonte majeure ; pas d'exigence de scaling automatique en Phase 1.

**Total NFRs : 12** (NFR-P1 à P4, S1 à S4, I1 à I3, R1, SC1, SC2)

### Additional Requirements

- **Contraintes techniques (PRD) :** Isolation tenant à toutes les couches ; idempotence webhooks (MessageSid + tenant_id) ; outbox + retries + DLQ pour messages sortants ; logs avec correlationId ; workers horizontaux envisagés post-MVP.
- **Compliance :** RGPD si applicable ; traçabilité commandes et preuves pour litiges.
- **Intégrations :** Twilio (webhook entrant/sortant, signature, idempotence) ; pas d'API publique en MVP.

### PRD Completeness Assessment

Le PRD est **complet et structuré** pour le MVP : 46 FRs numérotés et regroupés par domaine (Onboarding, WhatsApp, Live Session, Pricing, Stock, Reservations, Orders/Proofs, Dashboard, Subscription, Ops), 12 NFRs explicites (Performance, Security, Integration/Reliability, Scalability). Contraintes techniques, compliance et intégrations sont documentées. Le document convient comme base de traçabilité pour la validation de couverture (epics/stories lorsqu’ils existeront) et pour l’alignement Architecture / UX.

---

## Step 3: Epic Coverage Validation

### Epic FR Coverage Extracted (from epics.md)

- **FR1–FR5:** Epic 1 – Inscription, connexion et configuration vendeur
- **FR6–FR10, FR39:** Epic 2 – Réception et envoi WhatsApp + session live
- **FR11–FR17, FR40, FR41:** Epic 3 – Prix, codes et produits
- **FR18–FR23, FR42, FR44, FR43:** Epic 4 – Réservation et confirmation client
- **FR24–FR27:** Epic 5 – Commandes et preuves d'acompte
- **FR29–FR34, FR45:** Epic 6 – Dashboard commandes et Live Ops
- **FR35, FR36:** Epic 7A – Landing et abonnement (go-to-market)
- **FR37, FR38, FR46:** Epic 7B – Ops console (logs, file d'erreurs, DLQ, scope STOP)

**Total FRs in epics:** 46 (tous les FR du PRD FR1–FR27, FR29–FR46 ; PRD n'utilise pas FR28).

### FR Coverage Analysis

Chaque FR du PRD (Step 2) a été comparé au document epics.md. Tous les 46 FR sont couverts par au moins un epic et des stories avec critères d'acceptation explicites (Given/When/Then) et traceabilité (ex. « And FRn couvert »).

| FR   | PRD (résumé)                          | Epic / Stories                         | Status    |
|------|----------------------------------------|----------------------------------------|-----------|
| FR1  | Inscription vendeur, création tenant   | Epic 1 (Story 1.2)                     | ✓ Covered |
| FR2  | Grille catégories→prix                 | Epic 1 (Story 1.4)                     | ✓ Covered |
| FR3  | Frais de livraison (optionnel)         | Epic 1 (Story 1.5)                     | ✓ Covered |
| FR4  | Connecter WhatsApp Twilio au tenant    | Epic 1 (Story 1.6)                     | ✓ Covered |
| FR5  | Manager invite agent, accès dashboard  | Epic 1 (Story 1.7)                     | ✓ Covered |
| FR6  | Webhook entrants, attribution tenant   | Epic 2 (Story 2.1)                     | ✓ Covered |
| FR7  | Router vendeur vs client               | Epic 2 (Story 2.2)                     | ✓ Covered |
| FR8  | Idempotence MessageSid + tenant        | Epic 2 (Story 2.1)                     | ✓ Covered |
| FR9  | Messages sortants outbox + retry + DLQ | Epic 2 (Stories 2.4, 2.5)              | ✓ Covered |
| FR10 | STOP client, système en tient compte  | Epic 2 (Story 2.5)                     | ✓ Covered |
| FR11 | Prix code via grille lettre           | Epic 3 (Story 3.1)                     | ✓ Covered |
| FR12 | Unicité code (tenant, session, code)  | Epic 3 (Story 3.2)                     | ✓ Covered |
| FR13 | Codes format libre, pas de catalogue   | Epic 3 (Story 3.3)                     | ✓ Covered |
| FR14 | Code non préparé = article unique qty 1| Epic 3 (Story 3.3)                     | ✓ Covered |
| FR15 | Stock préparé WhatsApp CODE xQTE + photo| Epic 3 (Stories 3.4, 3.5)             | ✓ Covered |
| FR16 | Décrément stock à confirmation seulement| Epic 3 (Story 3.6)                    | ✓ Covered |
| FR17 | Concurrence, transaction atomique     | Epic 3 (Story 3.6)                     | ✓ Covered |
| FR18 | Tunnel réservation → adresse → OUI     | Epic 4 (Story 4.1)                     | ✓ Covered |
| FR19 | File d'attente si déjà réservé         | Epic 4 (Story 4.3)                     | ✓ Covered |
| FR20 | TTL configurable réservation           | Epic 4 (Story 4.3)                     | ✓ Covered |
| FR21 | Rappel T-2 min, expiration T=0         | Epic 4 (Stories 4.3, 4.4)              | ✓ Covered |
| FR22 | Promotion auto premier en file         | Epic 4 (Story 4.3)                     | ✓ Covered |
| FR23 | Acompte recommandé, soft/locked        | Epic 4 (Story 4.5)                     | ✓ Covered |
| FR24 | Commande numéro unique VF-XXXX         | Epic 5 (Story 5.1)                     | ✓ Covered |
| FR25 | Statuts commande new→delivered/cancelled| Epic 5 (Story 5.2)                     | ✓ Covered |
| FR26 | Valider/refuser preuve acompte         | Epic 5 (Story 5.3)                     | ✓ Covered |
| FR27 | Notifier client statut commande        | Epic 5 (Story 5.4)                     | ✓ Covered |
| FR29 | Liste commandes, filtres, statuts      | Epic 6 (Story 6.1)                     | ✓ Covered |
| FR30 | Proofs inbox, valider/refuser          | Epic 6 (Story 6.2)                     | ✓ Covered |
| FR31 | Mise à jour statut commande            | Epic 6 (Story 6.3)                     | ✓ Covered |
| FR32 | Live Ops : éléments, codes, réservations| Epic 6 (Story 6.4)                    | ✓ Covered |
| FR33 | Libérer réservation, override manuel  | Epic 6 (Story 6.4)                     | ✓ Covered |
| FR34 | Export CSV (commandes)                 | Epic 6 (Story 6.5)                     | ✓ Covered |
| FR35 | Landing présentation produit           | Epic 7A (Story 7A.1)                   | ✓ Covered |
| FR36 | Gérer abonnement / entitlements tenant | Epic 7A (Story 7A.2)                  | ✓ Covered |
| FR37 | Ops logs événements (correlationId)    | Epic 7B (Story 7B.1)                  | ✓ Covered |
| FR38 | File d'erreurs (media, envoi échoué)   | Epic 7B (Story 7B.2)                  | ✓ Covered |
| FR39 | Session live auto (création, last_activity, fermeture)| Epic 2 (Story 2.6)              | ✓ Covered |
| FR40 | Code déjà utilisé, pas d'update implicite| Epic 3 (Story 3.2)                    | ✓ Covered |
| FR41 | Photo vendeur → dernier code (fenêtre) | Epic 3 (Story 3.5)                     | ✓ Covered |
| FR42 | Code inexistant / typo, message clair   | Epic 4 (Story 4.2)                     | ✓ Covered |
| FR43 | États paiement no_deposit → deposit_*  | Epic 4 (Story 4.5), Epic 5             | ✓ Covered |
| FR44 | Règle acompte soft/locked (TTL)        | Epic 4 (Story 4.5)                     | ✓ Covered |
| FR45 | Audit trail horodaté (event_log)       | Epic 2/4 (création), Epic 6 (affichage/filtres/export)| ✓ Covered |
| FR46 | Scope STOP tenant, messages autorisés  | Epic 2 (Story 2.5), Epic 7B (Story 7B.3)| ✓ Covered |

### Missing FR Coverage

Aucun. Tous les 46 FR du PRD sont couverts par au moins un epic et des stories avec critères d'acceptation et traceabilité explicite.

### Coverage Statistics

- **Total PRD FRs:** 46
- **FRs covered in epics:** 46
- **Coverage percentage:** 100 %

---

## Step 4: UX Alignment Assessment

### UX Document Status

**Found.** Documents utilisés : `ux-design-specification.md`, `ux-design-directions.html`.

### UX ↔ PRD Alignment

- **Aligné :** Boucles centrales (cliente : CODE → statut → adresse → OUI → acompte/preuve → suivi ; vendeur : tags + grille → annonce codes → dashboard commandes + proofs + live ops). Statuts (réservé, file, expiré, confirmé, livré) cohérents avec les FR (réservation, waitlist, TTL, commandes, preuves). Routage vendeur vs client (FR7) explicite en UX (message A12 vendeur = création item, pas réservation). Live session auto (FR39) : UX confirme « LIVE ON/OFF non requis ». Décrément stock à la confirmation (FR16) : UX distingue Réservé vs Confirmé.
- **Exigences UX reflétées dans le PRD :** P95 bot < 2 s (NFR-P1), webhook < 1 s (NFR-P3), polling dashboard 30–60 s (NFR-P4), Proofs inbox dans le flux (FR30), Live Ops minimal (FR32–FR33).

### UX ↔ Architecture Alignment

- **Aligné :** Architecture prévoit webhook < 1 s + workers (P95 bot < 2 s) ; dashboard via tRPC (liste commandes, Proofs inbox, Live Ops) ; même vocabulaire de statuts (réservé, confirmé, etc.) ; outbox + DLQ pour notifications ; event_log et correlationId pour audit. Design system (Tailwind / shadcn) compatible avec stack T3 (Tailwind).
- **Composants UX couverts par l’archi :** OrderRowWithProof, LiveOpsSessionView, StatusBadge, ProofsInboxFilter ; structure projet prévoit `src/components/orders/`, `live-ops/`, `proofs/`.

### Alignment Issues

Aucun écart bloquant identifié entre UX, PRD et Architecture.

### Warnings

Aucun. UX documenté et aligné avec PRD et Architecture.

---

## Step 5: Epic Quality Review

### Statut

**Document Epics & Stories :** epics.md (step 1). Revue qualité effectuée selon les bonnes pratiques create-epics-and-stories.

### Epic Structure Validation (User Value & Independence)

- **Epic 1–7B :** Tous centrés sur la valeur utilisateur ; aucun epic « technique » pur. Epic 1 Story 1.1 (T3 App, Prisma) conforme à l'exigence Architecture (starter template).
- **Indépendance :** Epic 1 autonome ; Epic 2 dépend d'Epic 1 ; Epic 3 dépend d'Epic 1–2 ; Epic 4–6 chaînés ; Epic 7A/7B dépendent d'Epic 1. Aucune dépendance « vers l'avant ».

### Story Quality & Special Checks

- Stories de taille appropriée, Given/When/Then/And, traceabilité FR (« And FRn couvert »). Tables créées au fil des epics (pas tout en Epic 1 Story 1). Starter template couvert par Epic 1 Story 1.1.

### Best Practices Compliance

- [x] Epics livrent une valeur utilisateur | [x] Epics indépendants | [x] Stories complétables une par une | [x] Pas de dépendances vers l'avant | [x] Tables créées quand nécessaires | [x] AC clairs | [x] Traceabilité FR.

### Quality Assessment Summary

- **Critical violations :** Aucune. **Major issues :** Aucun. **Minor :** Aucun. Document prêt pour l'implémentation.

---

## Summary and Recommendations

### Overall Readiness Status

**READY** — PRD, Architecture, UX et Epics & Stories sont complets et alignés. Couverture FR 100 %, qualité epics validée, aucun blocant identifié.

### Critical Issues Requiring Immediate Action

Aucun. Le document epics.md couvre les 46 FR avec des stories à critères d'acceptation clairs ; la structure des epics respecte les bonnes pratiques (valeur utilisateur, indépendance, starter template).

### Recommended Next Steps

1. **Démarrer l'implémentation** — Suivre l'architecture (T3, webhook &lt; 1 s, workers, Prisma, outbox) : première priorité `npm create t3-app@latest` (Epic 1 Story 1.1), puis couche workers + route webhook Twilio (Epic 2).
2. **Livrer par epic** — Utiliser epics.md comme backlog : Epic 1 → Epic 2 → … → Epic 6 ; Epic 7A/7B en parallèle ou après selon priorité produit.

### Final Note

L'évaluation (rejouée après création des epics) confirme **100 % de couverture FR**, **aucune violation critique** de qualité epics, et **alignement** PRD / Architecture / UX / Epics. Le projet SnapSell est prêt pour la Phase 4 (implémentation).
