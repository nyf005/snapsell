---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
inputDocuments:
  - product-brief-SnapSell-2026-02-03.md
briefCount: 1
researchCount: 0
brainstormingCount: 0
projectDocsCount: 0
workflowType: prd
date: 2026-02-03
classification:
  projectType: saas_b2b
  domain: retail_live_commerce
  complexity: medium
  projectContext: greenfield
---

# Product Requirements Document - SnapSell

**Author:** Fabrice  
**Date:** 2026-02-03

---

## Executive Summary

SnapSell est une solution **WhatsApp-first** qui transforme n'importe quel live (TikTok, Instagram, Snap, etc.) en **commandes structurées** : le live reste sur la plateforme choisie, le checkout est unique sur WhatsApp. Le web est la console business & ops (abonnement, configuration, commandes, preuves d'acompte). **Différenciateur :** codes physiques + grille catégories→prix, réservation atomique + file + TTL + acompte recommandé ; modèle hybride stock préparé + flux improvisé, sans catalogue complet obligatoire. **Cibles :** vendeurs live-first (solo), vendeurs stock préparé / boutiques, managers, agentes, clientes finales.

---

## Success Criteria

### User Success

**Vendeurs (live-first + stock préparé)**  
- Transformer un live chaotique en **commandes fiables** (réservées/confirmées) sans perdre du temps ; réduire les **réservations fantômes** grâce à l'acompte recommandé ; ne plus porter la charge mentale des codes / du « premier arrivé ».  
- Signaux : pendant le live — réponses rapides du bot (« réservé / file / expiré »), moins de disputes en DM ; après le live — écran « à préparer / à livrer » propre, sans tri manuel.  
- Moment « ça règle mon problème » : premier live où il finit avec une **liste prête à livrer** + moins de relances + moins d'embrouilles « j'étais la première ».

**Managers / Owners**  
- Visibilité + contrôle (vendu, confirmé, livré, no-show) ; réduction des pertes (moins de fantômes, survente, litiges).  
- Signaux : dashboard clair (volumes live, taux de confirmation, taux no-show, stock restant) ; moins de problèmes à gérer (support, disputes).  
- Moment « ça valait le coup » : plus de livraisons réussies, moins d'annulations, moins de temps ops.

**Clientes finales**  
- Réserver sans stress, comprendre le prix, confirmer vite, être livrée ; être respectée (pas de spam, STOP fonctionne).  
- Signaux : réponse immédiate (« tu es #1 / #N », timer clair) ; total clair + instructions simples ; notifications utiles de statut.  
- Moment « ça marche » : elle obtient l'article sans bataille et suit sa commande sans relancer.

### Business Success

- **North Star :** Commandes livrées issues d'un live / semaine (usage live + qualité confirmation/exécution + valeur business).  
- **Horizon 3 mois :** X vendeurs actifs hebdo ; Y lives/semaine via SnapSell ; Z % de confirmation moyenne ; MRR cible + coût WhatsApp maîtrisé.  
- **Horizon 12 mois :** Expansion (plus de vendeurs, équipes), amélioration rétention, montée en charge ; multi-canal « view anywhere / checkout WhatsApp ».

### Technical Success

- Temps « code → réservation » P95 < 2 s ; temps « réservation → confirmation » médiane < 5 min.  
- 0 double attribution sur pièces uniques (audit).  
- Outbox DB + retries + DLQ (messages sortants) ; logs d'événements (correlationId) ; délivrabilité WhatsApp maîtrisée.

### Measurable Outcomes (go/no-go MVP)

- **Adoption & usage :** ≥ 60 % des ventes live passent par SnapSell ; temps code → réservation P95 < 2 s ; réservation → confirmée médiane < 5 min.  
- **Qualité & anti-chaos :** 0 double attribution ; réduction disputes « premier arrivé » ; taux réservations fantômes ↓.  
- **Paiement & engagement :** % commandes avec acompte (objectif selon vendeurs) ; délai validation preuve acceptable.  
- **Business (3 mois) :** X vendeurs actifs hebdo (ex. 10–20) ; rétention M1 > 60 % ; coût WhatsApp/vendeur sous seuil cible.

---

## Product Scope

### MVP - Minimum Viable Product

**Problème central :** Transformer un live + DM WhatsApp en commandes fiables (sans chaos « premier arrivé », sans réservations fantômes, sans charge mentale codes ↔ articles, sans tri manuel après le live).

**Critère MVP :** Un vendeur peut (1) vendre en live uniquement avec WhatsApp (sans dashboard obligatoire), (2) utiliser un système de codes lié aux catégories/prix (A/B/C → prix), (3) gérer pièces uniques + stock préparé avec le même système de codes, (4) obtenir à la fin une liste de commandes propre dans le web dashboard.

**Core features (P0) :**  
- **WhatsApp (Twilio) :** webhook + vérif signature + idempotence ; routing vendeur vs client ; parser intents v1 (vendeur : stock préparé, item live, LIVE ON/OFF ; client : code, adresse, OUI, STOP).  
- **Pricing par catégories + codes :** grille tenant (A/B/C → prix) ; codes format libre (A12, B7…) ; unicité code par (tenant_id, live_session_id, code).  
- **Deux modes produits :** Unique (default, quantité 1) ; Stock préparé via WhatsApp vendeur (Photo + CODE xQTE, décrément auto).  
- **Réservation + anti-fantômes :** réservation atomique + waitlist + TTL (5–15 min) ; rappel T-2 min + expiration + auto-promotion waitlist ; acompte recommandé + preuve (image/texte) + validation vendeur.  
- **Commandes & statuts :** numéro VF-XXXX ; statuts new → confirmed → delivered/cancelled ; notifications WhatsApp statut.  
- **Web App :** landing ; subscription/entitlements simples ; dashboard (liste commandes + statuts + filtres, Live Ops minimal, Proofs inbox).  
- **Fiabilité Ops :** outbox DB + retries + DLQ ; logs (correlationId) ; file erreurs minimale.

### Growth Features (Post-MVP)

- Boutons/menus WhatsApp avancés (si dispo).  
- Analytics de base (volumes, confirmation, no-show).  
- Amélioration UX dashboard et Live Ops.

### Vision (Future) — 12–24 mois

- **Omnicanal « signals » :** live TikTok/IG/Snap ; WhatsApp reste checkout + plus d'automations.  
- **Catalogue accéléré :** import CSV / Google Sheets ; enrichissement post-live (codes uniques invendus → fiches).  
- **Paiements :** lien de paiement + webhooks ; règles d'acompte adaptatives.  
- **Scalabilité :** workers horizontaux + Redis/broker ; SSE/WebSocket pour Live Ops.  
- **Ops avancées :** multi-agents, assignation, SLA, templates configurables ; analytics confirmations, no-show, zones.

---

## User Journeys

### 1. Vendeur solo Live-first — Parcours de succès

- **Ouverture :** Marie vend en live sur TikTok, seule. 500 pièces uniques, DM WhatsApp en pagaille, disputes « j'étais la première », réservations fantômes.
- **Montée :** Elle découvre SnapSell, s'inscrit sur le web, configure la grille A/B/C et connecte WhatsApp. Avant le live elle colle les étiquettes (A12, B07…). Pendant le live elle annonce les codes ; les clientes envoient le code sur WhatsApp.
- **Climax :** Le bot répond tout de suite (réservé / file / expiré). Plus de bataille en DM. À la fin du live elle ouvre le dashboard : liste de commandes prête à préparer/livrer, preuves d'acompte à valider.
- **Résolution :** Premier live « propre » — moins de relances, moins d'embrouilles. SnapSell devient son canal unique de checkout post-live.

### 2. Vendeur solo — Cas limite (réservation expirée)

- **Ouverture :** Une cliente en file d'attente n'a pas confirmé dans le TTL.
- **Montée :** Le bot envoie le rappel T-2 min, puis à T=0 expire la réservation et promeut automatiquement la suivante en file.
- **Climax :** Marie voit dans le dashboard la réservation expirée et la nouvelle confirmée ; pas de double vente, pas de litige manuel.
- **Résolution :** Les règles (TTL, file, promotion) sont appliquées par le système ; elle garde le contrôle via le dashboard si besoin (libérer, réouvrir).

### 3. Vendeur Stock préparé / Boutique

- **Ouverture :** Karim a une boutique avec du stock en quantité ; il fait du live + vente catalogue. Survente et commandes non structurées le stressent.
- **Montée :** Il enregistre à l'avance sur le web (ou via WhatsApp vendeur) : codes, quantités, catégories. En live il annonce les codes ; les clients envoient le code sur WhatsApp.
- **Climax :** Chaque réservation/commande décrémente le stock ; plus de survente. Dashboard : commandes prêtes pour prépa/livraison, stock à jour.
- **Résolution :** Catalogue réutilisable, historique commandes, exports pour la compta/ops.

### 4. Manager / Owner

- **Ouverture :** Thomas pilote plusieurs vendeurs ; il manque de visibilité (commandes, confirmations, no-shows) et de contrôle (prix, TTL, acompte).
- **Montée :** Il configure sur le web : abonnement, grille catégories/prix, TTL, règle d'acompte. Il consulte le dashboard : volumes live, taux de confirmation, no-show, stock restant.
- **Climax :** Visibilité hebdo claire ; les règles (prix, TTL, acompte) sont appliquées par le produit sans micro-gestion du live.
- **Résolution :** Pilotage par les données, maîtrise des coûts (abonnement, WhatsApp), délégation possible aux agents.

### 5. Agent / Assistante de vente

- **Ouverture :** Sophie aide le vendeur : exceptions, preuves d'acompte, statuts, litiges.
- **Montée :** Elle utilise le dashboard : liste commandes, Proofs inbox (valider/refuser), mise à jour des statuts (prépa → livraison → livré).
- **Climax :** Elle traite vite les preuves et les litiges sans repasser par les DM ; le vendeur garde le focus sur le live.
- **Résolution :** Exceptions gérées de façon centralisée ; handoff WhatsApp possible si besoin.

### 6. Cliente finale

- **Ouverture :** Awa regarde le live, veut réserver un article sans se battre en DM.
- **Montée :** Elle envoie le code sur le numéro WhatsApp du vendeur. Le bot répond immédiatement (« tu es #1 » ou « tu es en file #N », timer). Elle envoie son adresse, dit OUI pour confirmer, envoie la preuve d'acompte si demandé.
- **Climax :** Réservation confirmée, prix et total clairs ; elle reçoit les notifications de statut (confirmé, livré) sans avoir à relancer.
- **Résolution :** Elle obtient l'article sans bataille ; elle réutilisera le même canal pour les prochains lives.

### 7. Ops interne SnapSell / Support

- **Ouverture :** Un vendeur signale un message WhatsApp non délivré ou une erreur bot.
- **Montée :** L'ops consulte la console : logs (correlationId), file d'erreurs, retries, DLQ.
- **Climax :** Diagnostic rapide (media non attaché, envoi échoué, etc.) ; correction ou conseil (config Twilio, catégories/prix).
- **Résolution :** Incidents et délivrabilité maîtrisés ; moins d'échecs récurrents.

### Journey Requirements Summary

- **Onboarding vendeur :** Inscription web, grille catégories/prix, frais livraison (optionnel), connexion WhatsApp (Twilio).
- **Live ops :** Étiquettes codes, annonce en live ; bot WhatsApp (parser intents vendeur/client), réservation atomique, file, TTL, rappel, expiration, promotion waitlist.
- **Stock préparé :** Enregistrement web ou WhatsApp vendeur (Photo + CODE xQTE) ; décrément stock à la réservation/commande.
- **Commandes & preuves :** Numéro VF-XXXX, statuts (new → confirmed → delivered/cancelled), Proofs inbox (valider/refuser), notifications WhatsApp statut.
- **Dashboard :** Liste commandes + filtres, Live Ops minimal (items/codes, réservations, libérer), exports CSV.
- **Manager :** Abonnement, paramètres (catégories, TTL, acompte), dashboard visibilité, délégation agents.
- **Ops / Support :** Logs, file erreurs, audit trail, outils de diagnostic et de correction.

---

## Domain-Specific Requirements

### Compliance & réglementation

- **Données personnelles (RGPD si UE / clients EU) :** consentement, droit d'accès/suppression, durée de conservation (numéros, adresses, preuves).
- Pas de régulation type santé/finance ; conformité contractuelle et bonnes pratiques e‑commerce (preuves d'acompte, traçabilité commandes).

### Contraintes techniques

- **Sécurité :** numéros vendeurs/clients, adresses, preuves paiement — accès restreint par tenant ; logs (correlationId) pour audit.
- **Intégration :** WhatsApp Business API (Twilio) — vérif signature, idempotence (MessageSid + tenant), gestion rate limits et délivrabilité.
- **Disponibilité :** webhook Twilio critique pendant le live ; outbox + retries + DLQ pour ne pas perdre de messages.

### Exigences d'intégration

- Twilio : webhook entrant, envoi sortant, statuts de livraison.
- Données vendeur : grille catégories/prix, TTL, règles acompte — cohérence web ↔ bot WhatsApp.

### Risques et mitigations

- **Double attribution (pièce unique) :** réservation atomique + unicité (tenant_id, live_session_id, code) ; audit pour go/no-go.
- **Réservations fantômes :** TTL + file + promotion auto ; acompte recommandé + preuve ; rappel T-2 min.
- **Délivrabilité WhatsApp :** templates conformes, file d'erreurs + retries ; console ops pour diagnostic.
- **Litiges « premier arrivé » :** file d'attente explicite, statuts clairs (réservé/file/expiré) ; pas d'ambiguïté côté client.

---

## Innovation & Novel Patterns

### Detected Innovation Areas

- **Checkout unique WhatsApp, canal de live découplé :** le live reste sur TikTok/IG/Snap ; seul le checkout passe par WhatsApp. Pas de dépendance à l'inbox native de chaque plateforme — un seul flux de commandes pour tous les lives.
- **Workflow live commerce structuré :** codes physiques (étiquettes) + grille catégories→prix ; réservation atomique + file d'attente + TTL + expiration + promotion auto ; acompte recommandé + preuve (image/texte) + validation vendeur. Le chaos « premier arrivé » et les fantômes sont gérés par le workflow, pas à la main.
- **Modèle hybride stock préparé + flux improvisé :** même système de codes pour pièces uniques (quantité 1) et stock en quantité (décrément auto) ; pas de catalogue complet obligatoire avant le live.

### Market Context & Competitive Landscape

- Les solutions classiques supposent soit un catalogue détaillé avant le live, soit une saisie lourde pendant le live. SnapSell cible le **cas hybride** : stock + pièces uniques improvisées, avec checkout unique sur WhatsApp.
- Différenciation : **aucune saisie lourde** en live ; **prix par catégorie** partout ; **anti-fantômes** (TTL + acompte) intégré au parcours.

### Validation Approach

- **MVP go/no-go :** ≥ 60 % des ventes live passent par SnapSell ; temps code→réservation P95 < 2 s ; 0 double attribution ; réduction qualitative des disputes et des fantômes.
- **Pilote :** X vendeurs actifs hebdo (ex. 10–20), rétention M1 > 60 %, coût WhatsApp/vendeur sous seuil.

### Risk Mitigation

- **Adoption faible :** friction minimale (onboarding court, codes + catégories), valeur visible dès le premier live (liste propre).
- **Délivrabilité WhatsApp :** conformité templates, outbox + retries + DLQ, console ops pour diagnostic.
- **Innovation non validée :** le MVP reste utilisable même si le « checkout unique quel que soit le canal » n'est pas le seul facteur de succès ; la structuration des commandes reste la valeur centrale.

---

## SaaS B2B Specific Requirements

### Project-Type Overview

SnapSell est une plateforme SaaS B2B multi-tenant : chaque vendeur (ou boutique) est un tenant avec son propre espace (grille catégories/prix, numéro WhatsApp, commandes, dashboard). Les utilisateurs sont le vendeur, le manager/owner, l'agent/assistante ; la cliente finale interagit uniquement via WhatsApp (pas de compte plateforme). Le web sert de console business & ops (abonnement, configuration, commandes, preuves).

### Technical Architecture Considerations

- **Multi-tenancy (tenant_model) :** Un tenant = un vendeur/boutique (tenant_id). Données strictement isolées : commandes, réservations, grille catégories/prix, config WhatsApp/Twilio, preuves. Unicité des codes par (tenant_id, live_session_id, code). Pas de multi-numéros WhatsApp par tenant en MVP.
- **Permissions (rbac_matrix) :** Rôles : Owner/Manager (abonnement, paramètres, dashboard, exports), Vendeur (live ops, commandes, proofs), Agent (dashboard commandes + proofs + statuts, pas de config globale). Délégation possible (invitation agent). Pas de RBAC fin par ressource en MVP ; ownership par tenant suffit.
- **Subscription tiers (subscription_tiers) :** Abonnement / entitlements simples (même manuel au début). Quotas et coûts WhatsApp maîtrisés côté produit ; détails tarifaires hors PRD. Landing + gestion abonnement dans le web.
- **Integrations (integration_list) :** Twilio (WhatsApp Business API) : webhook entrant, envoi sortant, vérif signature, idempotence (MessageSid + tenant). Web : dashboard, config, pas d'API publique en MVP.
- **Compliance (compliance_reqs) :** Conformité données personnelles (RGPD si applicable) : consentement, accès/suppression, rétention. Pas de régulation type santé/finance. Traçabilité commandes et preuves pour litiges.

### Implementation Considerations

- Isolation tenant à toutes les couches (DB, cache, files) ; pas de fuite cross-tenant. Idempotence des webhooks (MessageSid + tenant_id). Outbox + retries + DLQ pour messages sortants ; logs avec correlationId pour diagnostic. Scalabilité : workers horizontaux envisagés post-MVP.

---

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

- **Approche MVP :** MVP centré **problème** : prouver que le chaos live + DM peut devenir des **commandes fiables** (réservation atomique, file, TTL, acompte) sans saisie lourde. Le vendeur peut vendre en live avec WhatsApp seul ; le dashboard web sert à la prépa/livraison et aux preuves.
- **Critère « utile » :** Premier live terminé avec une liste de commandes prête à livrer, sans disputes « premier arrivé » ni fantômes non gérés.
- **Apprentissage validé :** Adoption (≥ 60 % ventes via SnapSell), qualité (0 double attribution, réduction disputes/fantômes), rétention M1 > 60 %.
- **Ressources :** Équipe minimale pour webhook Twilio + logique réservation/file/commandes + web dashboard + fiabilité (outbox, retries, logs). Pas d'API publique ni de multi-numéros en MVP.

### MVP Feature Set (Phase 1)

**Parcours utilisateur couverts :** Vendeur solo live-first (succès + cas limite réservation expirée), vendeur stock préparé, manager/owner (config + dashboard), agent (proofs + statuts), cliente finale (code → confirmation → suivi), ops SnapSell (logs, erreurs).

**Capacités must-have :** WhatsApp (Twilio) : webhook, idempotence, routing vendeur/client, intents v1. Grille catégories→prix + codes (unicité par tenant/live/code). Modes unique + stock préparé (décrément auto). Réservation atomique + file + TTL + rappel + expiration + promotion waitlist. Acompte recommandé + preuve + validation. Commandes VF-XXXX + statuts + notifications. Web : landing, abonnement simple, dashboard (commandes, Live Ops minimal, Proofs inbox). Fiabilité : outbox, retries, DLQ, logs, file erreurs.

### Post-MVP Features

**Phase 2 (Growth) :** Boutons/menus WhatsApp avancés (si dispo). Analytics de base (volumes, confirmation, no-show). Amélioration UX dashboard et Live Ops.

**Phase 3 (Expansion / Vision 12–24 mois) :** Omnicanal (signals TikTok/IG/Snap, checkout WhatsApp). Catalogue accéléré (CSV/Sheets, enrichissement post-live). Paiements (liens + webhooks, acompte adaptatif). Scalabilité (workers, Redis, SSE/WebSocket). Ops avancées (multi-agents, SLA, analytics no-show/zones).

### Risk Mitigation Strategy

- **Technique :** Idempotence webhooks, outbox + DLQ pour ne pas perdre de messages ; audit double attribution pour go/no-go. Simplification : pas de temps réel (polling suffit en MVP).
- **Marché :** Friction minimale à l'onboarding ; valeur visible dès le premier live. Pilote 10–20 vendeurs actifs hebdo pour valider adoption et rétention.
- **Ressources :** MVP livrable avec une équipe réduite ; abonnement/entitlements manuels au début ; pas d'API publique ni de multi-numéros en Phase 1.

---

## Functional Requirements

*Contrat de capacités : UX, architecture et epics s'y rattachent. Tout ce qui n'est pas listé n'existe pas sauf ajout explicite.*

### Onboarding & Configuration

- **FR1:** Le vendeur peut s'inscrire et créer un tenant (espace isolé).
- **FR2:** Le vendeur (ou manager) peut configurer une grille catégories→prix (ex. A, B, C → montants).
- **FR3:** Le vendeur (ou manager) peut configurer les frais de livraison (optionnel).
- **FR4:** Le vendeur peut connecter un numéro WhatsApp (Twilio) à son tenant.
- **FR5:** Le manager peut inviter un agent et lui donner accès au dashboard (commandes, proofs).

### WhatsApp Messaging & Routing

- **FR6:** Le système peut recevoir des messages entrants WhatsApp (webhook) et les attribuer au bon tenant.
- **FR7:** Le système peut distinguer un message vendeur d'un message client ; les numéros vendeur = `seller_phone(s)` enregistrés côté tenant (pas le `From` ambigu).
- **FR8:** Le système peut traiter les messages de façon idempotente (éviter doublons par MessageSid + tenant).
- **FR9:** Le système peut envoyer des messages sortants WhatsApp (notifications, rappels, statuts) via outbox + retry + DLQ.
- **FR10:** Le client peut signaler l'arrêt des messages (STOP) et le système en tient compte.

### Live Session (auto)

- **FR39:** Le système crée automatiquement une live_session active dès qu'il reçoit un signal « live » (ex. création item vendeur, ou 1ère réservation client) et qu'il n'existe aucune session active pour ce tenant. Pas besoin de commande explicite LIVE ON/OFF.
- **FR39 (suite):** Le système met à jour `last_activity_at` à chaque message pertinent (création item, réservation, confirmation, preuve, etc.). La session se ferme automatiquement après une période d'inactivité (T_inactive) configurable (ex. 30–60 min) ou via un job de fermeture. *Message produit : « Le vendeur vend, le bot suit. La session se crée et se ferme seule. »*

### Pricing & Codes

- **FR11:** Le système peut appliquer un prix à un code à partir de la lettre du code et de la grille catégories→prix du tenant.
- **FR12:** Le système garantit l'unicité d'un code dans (tenant_id, live_session_id, code). *Note : live_session est auto-créée et auto-fermée sur inactivité.*
- **FR13:** Le vendeur peut utiliser des codes au format libre (ex. A12, B7) sans catalogue préalable.
- **FR40:** Si le vendeur renvoie un code déjà existant dans la session : pas d'update implicite. Le bot répond : « Code déjà utilisé, choisis un autre ou envoie MODIF A12 … » (commande MODIF en P1 si besoin).

### Products & Stock

- **FR14:** Le système peut traiter un code non préparé comme article unique (quantité 1).
- **FR15:** Le vendeur peut enregistrer du stock préparé **sur WhatsApp** (prioritaire MVP) : `CODE xQTE` + photo optionnelle + tailles optionnelles. Enregistrement via web = optionnel MVP, pas nécessaire.
- **FR16:** Le système décrémente automatiquement le stock préparé **uniquement à la confirmation de commande** (pas à la réservation). Pendant la réservation, le système « bloque » sans consommer le stock.  
  *AC : Given un produit stock préparé S01 quantité=20 ; When un client réserve S01 → quantité reste 20, réservation active créée ; When le client confirme (OUI + adresse) → commande confirmée → quantité passe à 19.*
- **FR17:** Le système empêche la confirmation si le stock est épuisé et gère la concurrence.  
  *AC : Given quantité=0 au moment de confirmation ; When un client tente de confirmer → le bot répond « Désolé, épuisé » + place en waitlist si activée. Règle concurrence : si 2 clients confirment en même temps sur le dernier stock → 1 seule confirmation gagne (transaction atomique), l'autre reçoit « épuisé » et bascule waitlist si dispo.*

### Reservations & Waitlist

- **FR18:** Le client peut réserver un article (code) puis fournir son adresse et confirmer (OUI) ; le système gère le tunnel **réservation → collecte adresse → confirmation → commande**. La réservation et la file d'attente s'attachent à un live_item lié à la live_session active.
- **FR19:** Le système peut placer le client en file d'attente si l'article est déjà réservé.
- **FR20:** Le système peut appliquer un TTL configurable à une réservation (ex. 5–15 min).
- **FR21:** Le système peut envoyer un rappel avant expiration (ex. T-2 min) et expirer la réservation à T=0.
- **FR22:** Le système peut promouvoir automatiquement le premier en file lorsque une réservation expire.
- **FR41:** Une photo envoyée par le vendeur est liée au **dernier code** créé/édité par le vendeur dans une fenêtre (ex. 2 min). Si pas de correspondance : le bot demande « Envoie d'abord CODE PRIX ».
- **FR42:** Si le client envoie un code inexistant (ex. A12 absent) : message clair + exemple. Si le client envoie une typo (ex. A12A) : parsing tolérant + suggestion.
- **FR44:** Règle anti–réservation fantôme (verrouillage) : sans acompte = réservation « soft » TTL court (ex. 5 min) ; avec acompte = réservation « locked » TTL normal (ex. 10–15 min). Option P1 : acompte obligatoire au-delà d'un seuil prix.

### Orders, Proofs & États de paiement

- **FR23:** Le système **recommande** un acompte et peut traiter la réservation en « non verrouillée » si pas d'acompte (TTL court) ; avec acompte = réservation verrouillée (TTL normal).
- **FR43:** États de paiement minimum : `no_deposit` / `deposit_pending` / `deposit_approved` / `deposit_rejected`. Paiement à la livraison = défaut ; acompte = « lock » recommandé.
- **FR24:** Le système peut créer une commande avec un numéro unique (ex. VF-XXXX) à partir d'une réservation confirmée.
- **FR25:** Le système peut gérer les statuts de commande (ex. new → confirmed → delivered/cancelled).
- **FR26:** Le vendeur (ou agent) peut valider ou refuser une preuve d'acompte liée à une commande.
- **FR27:** Le système peut notifier le client par WhatsApp des changements de statut de sa commande.

### Dashboard & Ops

- **FR29:** Le vendeur (ou agent) peut consulter la liste des commandes avec filtres et statuts.
- **FR30:** Le vendeur (ou agent) peut consulter un espace « preuves » (Proofs inbox) et valider/refuser les preuves.
- **FR31:** Le vendeur (ou agent) peut mettre à jour le statut d'une commande (prépa, livraison, livré, annulé).
- **FR32:** Le vendeur (ou agent) peut consulter les éléments/codes et réservations en cours pour une session de live (Live Ops minimal).
- **FR33:** Le vendeur (ou agent) peut libérer une réservation ou intervenir manuellement si besoin (ex. libérer pour le suivant).
- **FR34:** Le manager peut exporter les données (ex. commandes) en CSV.
- **FR45:** Le système enregistre un audit trail minimal horodaté : création item, réservation, promotion waitlist, confirmation, preuves, changements statuts, overrides manuels.

### Subscription & Entitlements

- **FR35:** Un visiteur peut consulter une landing de présentation du produit.
- **FR36:** Le manager (ou vendeur) peut gérer l'abonnement / les entitlements du tenant (même manuel en MVP).

### Ops & Support

- **FR37:** L'ops SnapSell peut consulter les logs d'événements (avec correlationId) pour un tenant ou un message.
- **FR38:** L'ops SnapSell peut consulter une file d'erreurs (ex. media non attaché, envoi échoué) pour diagnostiquer les incidents.
- **FR46:** Scope opt-out (STOP) : scope = **tenant** (explicite). Définir quels messages restent autorisés après STOP (transactionnels stricts vs aucun).

---

## Non-Functional Requirements

*Seules les catégories pertinentes pour SnapSell sont documentées. Chaque NFR est testable et mesurable.*

### Performance

- **NFR-P1:** Temps « message client (code) → réponse bot (réservé / file / expiré) » : P95 < 2 secondes, dans des conditions de charge MVP (ex. 1 live actif par tenant).
- **NFR-P2:** Temps « réservation créée → commande confirmée (OUI + adresse) » : médiane < 5 min côté processus métier ; le système traite la confirmation et met à jour la commande en < 10 s après réception du message.
- **NFR-P3:** Le webhook Twilio est traité de façon à ne pas bloquer l’envoi de la réponse HTTP 200 au-delà de 1 s ; le traitement lourd (réservation, file, notifications) peut être asynchrone après accusé de réception.
- **NFR-P4:** Le dashboard web (liste commandes, Proofs inbox, Live Ops) affiche les données à jour avec un délai acceptable en MVP (polling ex. 30–60 s) ; pas d’exigence temps réel en Phase 1.

### Security

- **NFR-S1:** Données sensibles (numéros téléphone, adresses, preuves paiement) : accès strictement limité par tenant ; aucun accès cross-tenant.
- **NFR-S2:** Données sensibles chiffrées au repos et en transit (HTTPS, chiffrement stockage).
- **NFR-S3:** Vérification de signature des webhooks Twilio pour rejeter les requêtes non authentiques.
- **NFR-S4:** Si applicable (RGPD) : consentement, droit d’accès/suppression, rétention définie ; traçabilité minimale pour preuves et commandes.

### Integration & Reliability

- **NFR-I1:** Intégration Twilio (WhatsApp Business API) : webhook entrant traité avec idempotence (MessageSid + tenant_id) ; aucun message perdu par non-idempotence.
- **NFR-I2:** Messages sortants WhatsApp : envoi via outbox + retries avec backoff + DLQ après échec répété ; aucun message sortant « perdu » sans traçabilité (log + file erreurs).
- **NFR-I3:** En cas d’indisponibilité temporaire de Twilio ou du webhook : les messages entrants sont retentés par Twilio selon sa politique ; côté SnapSell, pas de perte de données déjà persistées (réservations, commandes).
- **NFR-R1:** Disponibilité cible MVP : le service de traitement des messages (webhook + workers) est opérationnel pendant les créneaux de live typiques ; objectif de disponibilité à définir (ex. 99 % sur plage 8h–24h) et à affiner en production.

### Scalability

- **NFR-SC1:** MVP : le système supporte au moins 10–20 tenants actifs hebdo avec 1 live actif par tenant et un volume de messages compatible avec les limites Twilio (ex. quelques centaines de messages/heure par tenant).
- **NFR-SC2:** Post-MVP : conception permettant montée en charge (workers horizontaux, Redis/broker si besoin) sans refonte majeure ; pas d’exigence de scaling automatique en Phase 1.
