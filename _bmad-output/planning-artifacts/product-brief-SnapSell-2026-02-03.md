---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments:
  - user-brief-SnapSell-2026-02-03.md
date: 2026-02-03
author: Fabrice
---

# Product Brief: SnapSell

<!-- Content will be appended sequentially through collaborative workflow steps -->

## Executive Summary

SnapSell est une solution **WhatsApp-first** qui transforme n'importe quel live (TikTok, Instagram, Snapchat, Facebook, etc.) en **commandes structurées** sans chaos. Le live reste sur la plateforme choisie ; le **checkout est unique sur WhatsApp** : le client envoie un code, SnapSell gère réservation, adresse, confirmation et suivi jusqu'à la livraison. Le **web** est la **console business & ops** (abonnement, configuration, commandes, preuve/acompte, pilotage), pas la porte d'entrée de vente.

---

## Core Vision

### Problem Statement

Les vendeurs de live commerce (souvent seuls ou en très petite équipe) font face à des **centaines de produits uniques** (ex. 500 pièces, plusieurs fois par semaine), des DM/WhatsApp chaotiques (« moi je prends », doublons, disputes), des **réservations fantômes** (clients qui disparaissent) et un stress opérationnel permanent (qui a réservé quoi, à quel prix, à qui livrer). Exiger un catalogue complet ou trop de saisie pendant le live tue l'adoption.

### Problem Impact

Sans structuration : perte de ventes, litiges, surcharge mentale, réservations non honorées. Les vendeurs restent coincés entre « tout cataloguer avant » (irréaliste) et « tout gérer à la main en live » (ingérable).

### Why Existing Solutions Fall Short

Les solutions classiques supposent soit un catalogue détaillé avant le live, soit une saisie lourde pendant le live. Elles ne couvrent pas le cas **hybride** : stock en quantité + pièces uniques improvisées, avec un **checkout unique sur WhatsApp** indépendant de la plateforme de diffusion.

### Proposed Solution

Modèle hybride **« Stock préparé » + « Flux improvisé »** :

- **Stock préparé :** le vendeur enregistre sur le web (code, catégorie → prix auto, quantité, optionnellement photo + titre). En live, il annonce le code ; le bot décrédite le stock et gère l'épuisement.
- **Flux improvisé :** pas de catalogue ; étiquette code sur l'article (ex. A12, B07). Le client envoie le code sur WhatsApp ; le bot applique le prix via la catégorie et traite l'article comme unique (quantité = 1).

**Prix :** une seule règle — **catégorie → prix** (grille configurable par vendeur, ex. A = 5 000 FCFA, B = 10 000, C = 15 000). Aucune saisie de prix en live.

**Parcours WhatsApp :** réservation (avec file d'attente et TTL), collecte adresse (commune/quartier/repère, frais auto), confirmation récap, **acompte recommandé** (preuve par capture) pour limiter les fantômes, expiration et promotion automatique du suivant en file.

**Web :** landing, abonnement/entitlements, configuration (grilles catégories, livraison, TTL, acompte, WhatsApp/Twilio), dashboard ops (commandes, validation acompte, exports CSV, logs/erreurs).

### Key Differentiators

- **Checkout WhatsApp unique**, quelle que soit la plateforme de live.
- **Aucune saisie lourde** pendant le live ; codes physiques (étiquettes) + catégories.
- **Prix automatique par catégorie** (A/B/C…) partout (préparé + improvisé).
- **Réservation atomique + file + expiration** pour limiter litiges et confusion.
- **Acompte recommandé** pour réduire les réservations fantômes.
- Un live éphémère devient une **liste claire de commandes livrables**.

---

## Target Users

### Primary Users

**1. Vendeur « Live-first » solo**  
*Segment principal — douleur maximale, adoption forte si friction basse.*

- **Rôle / contexte :** Vend en live sur TikTok / IG / Snap, souvent seul ; beaucoup de pièces uniques (parfois 500+), rythme rapide.
- **Problème vécu :** Chaos DM/WhatsApp, disputes « premier arrivé », réservations fantômes, stress pour savoir qui a réservé quoi.
- **Objectifs :** Vendre vite sans chaos, éviter les litiges, réduire les fantômes, finir le live avec une liste propre à livrer.
- **Utilisation SnapSell :** Colle les tags (A12, B07…), annonce le code en live, laisse les clientes commander sur WhatsApp ; consulte le dashboard après pour préparer et livrer.

**2. Vendeur « Stock préparé » / Boutique**  
*Segment principal — valeur durable, répétition + catalogue + rétention.*

- **Rôle / contexte :** Boutique ou marque avec produits en quantité ; parfois live + ventes hors live (catalogue).
- **Problème vécu :** Survente, commandes non structurées, exécution (prépa/livraison) difficile à piloter.
- **Objectifs :** Gérer le stock, éviter la survente, automatiser les commandes, structurer l'exécution, garder un catalogue utilisable après le live.
- **Utilisation SnapSell :** Enregistre produits + quantités + codes à l'avance sur le web ; SnapSell décrémente le stock et organise les commandes.

**3. Manager / Owner**  
*Segment principal côté business — pilotage + abonnement + contrôle.*

- **Rôle / contexte :** Propriétaire de boutique ou manager d'activité ; pilote le chiffre et la qualité ops.
- **Problème vécu :** Manque de visibilité (commandes, confirmations, no-shows), difficulté à faire respecter les règles (prix, TTL, acompte).
- **Objectifs :** Visibilité hebdo (commandes, confirmation, no-shows), contrôle des règles (catégories/prix, TTL, acompte), maîtriser abonnement/quotas et coûts WhatsApp.
- **Utilisation SnapSell :** Surtout web (subscription, paramètres, dashboard, exports) ; rarement en live.

### Secondary Users

**4. Agent / Assistante de vente**  
*Secondaire mais fréquent.*

- **Rôle :** Aide le vendeur (réponses, suivi, préparation) ; parfois plusieurs agents.
- **Objectifs :** Traiter rapidement les exceptions, valider acomptes/preuves, mettre à jour les statuts, gérer les litiges.
- **Utilisation :** Dashboard commandes + preuves + actions ops ; WhatsApp éventuellement en handoff.

**5. Cliente finale**  
*Secondaire mais critique.*

- **Rôle :** Regarde le live sur une plateforme, commande sur WhatsApp.
- **Objectifs :** Réserver sans se battre, comprendre prix/total, confirmer vite, suivre la livraison, éviter le spam.
- **Utilisation :** WhatsApp uniquement (code → adresse → confirmation → acompte recommandé → suivi).

**6. Ops interne SnapSell / Support**  
*Secondaire.*

- **Rôle :** Support pour onboarding, incidents, délivrabilité WhatsApp, litiges.
- **Objectifs :** Diagnostiquer vite (logs, erreurs, retries), aider à configurer catégories/prix et WhatsApp, limiter les échecs.
- **Utilisation :** Console ops, events/audit trail, outils de correction.

### User Journey

**Vendeur solo Live-first (parcours type)**  
- **Découverte :** Bouche-à-oreille, démo live, ou landing SnapSell.  
- **Onboarding :** Inscription web → config grille catégories/prix + (optionnel) frais livraison → connexion WhatsApp (Twilio).  
- **Usage quotidien :** Avant le live : étiquettes sur les articles. Pendant : annonce des codes, les clientes envoient le code sur WhatsApp. Après : dashboard pour voir commandes, valider acomptes, préparer livraisons.  
- **Moment de valeur :** Fin de live avec une liste claire de commandes, sans disputes « premier arrivé » ni réservations fantômes non gérées.  
- **Long terme :** SnapSell devient le canal unique de checkout post-live ; le vendeur garde le live sur sa plateforme préférée.

**Vendeur Stock préparé / Boutique**  
- **Découverte / onboarding :** Idem, plus temps sur la préparation du catalogue (codes, quantités, catégories).  
- **Usage :** Enregistrement des produits à l'avance ; en live ou hors live, les clients envoient le code → réservation + décrément stock.  
- **Moment de valeur :** Plus de survente, stock à jour, commandes prêtes pour la prépa/livraison.  
- **Long terme :** Catalogue réutilisable, historique commandes, exports pour la compta/ops.

**Manager / Owner**  
- **Découverte :** Besoin de pilotage et de contrôle des coûts (WhatsApp, abonnement).  
- **Usage :** Web : abonnement, paramètres (catégories, TTL, acompte), dashboard (commandes, confirmations, no-shows), exports.  
- **Moment de valeur :** Visibilité hebdo claire et règles appliquées (prix, TTL, acompte) sans micro-gestion du live.  
- **Long terme :** Pilotage par les données, maîtrise des coûts et des quotas.

**Cliente finale**  
- **Découverte :** Voit le live, entend « envoyez [code] sur WhatsApp ».  
- **Onboarding :** Aucun ; envoie le code sur le numéro SnapSell du vendeur.  
- **Usage :** Code → réservation (ou file) → adresse → confirmation → acompte recommandé (preuve) → suivi livraison.  
- **Moment de valeur :** Réservation confirmée sans se battre en DM, prix et total clairs.  
- **Long terme :** Réutilisation du même canal WhatsApp pour les prochains lives du vendeur.

---

## Success Metrics

### Succès côté utilisateurs

**1. Vendeurs (live-first + stock préparé)**  
- **Résultat recherché :** Transformer un live chaotique en **commandes fiables** (réservées/confirmées) sans perdre du temps ; réduire les **réservations fantômes** grâce à l'**acompte recommandé** ; ne plus porter la charge mentale des codes / du « premier arrivé ».  
- **Signaux visibles :** Pendant le live — réponses rapides du bot, « réservé / file / expiré » clair, moins de disputes en DM. Après le live — écran « à préparer / à livrer » propre, sans tri manuel.  
- **Moment « ça règle mon problème » :** Premier live où il finit avec une **liste prête à livrer** + moins de relances + moins d'embrouilles « j'étais la première ».  
- **Comportements qui prouvent la valeur :** Utilise SnapSell sur plusieurs lives/semaine ; grille catégories→prix + tags codes systématiquement ; active/applique l'acompte pour réserver ; met à jour les statuts (prépa → livraison → livré) au lieu de rester en DM.

**2. Managers / Owners**  
- **Résultat recherché :** Visibilité + contrôle (vendu, confirmé, livré, no-show) ; réduction des pertes (moins de fantômes, survente, litiges).  
- **Signaux visibles :** Dashboard clair (volumes live, taux de confirmation, taux no-show, délai moyen de confirmation, stock restant) ; moins de problèmes à gérer (support, disputes, remboursements informels).  
- **Moment « ça valait le coup » :** Gain net — plus de livraisons réussies, moins d'annulations, moins de temps ops.  
- **Comportements :** Configure catégories/prix, TTL, règle d'acompte ; invite un agent / délègue sur le dashboard ; exporte CSV, suit la perf hebdo.

**3. Clientes finales**  
- **Résultat recherché :** Réserver sans stress, comprendre le prix, confirmer vite, être livrée ; être respectée (pas de spam, STOP fonctionne).  
- **Signaux visibles :** Réponse immédiate (« tu es #1 / #N », timer clair) ; total clair + instructions simples (adresse + acompte recommandé) ; notifications utiles de statut.  
- **Moment « ça marche » :** Elle obtient l'article sans bataille et suit sa commande sans relancer.  
- **Comportements :** Confirme dans le délai, envoie adresse complète du 1er coup ; envoie acompte/preuve quand demandé ; suit les statuts.

### North Star Metric (recommandée)

**Commandes livrées issues d'un live / semaine**  
Parce que ça capture : usage live + qualité (confirmation + exécution) + valeur business.

---

### Business Objectives

**Horizon 3 mois**  
- X vendeurs actifs hebdo  
- Y lives/semaine via SnapSell  
- Z % de confirmation moyenne  
- MRR cible + coût WhatsApp maîtrisé  

**Horizon 12 mois**  
- Expansion (plus de vendeurs, équipes), amélioration rétention, montée en charge  
- Multi-canal « view anywhere / checkout WhatsApp »

---

### Key Performance Indicators

**KPIs Live (cœur du produit)**  
- **Temps « code → réservation » (P95)**  
- **Temps « réservation → confirmation » (médiane / P95)**  
- **Taux de confirmation** = réservations confirmées / réservations totales  
- **Taux no-show / fantômes** = réservations expirées / réservations totales  
- **Taux litiges (proxy)** = interventions manuelles / total réservations  
- **% commandes avec acompte** (et impact sur no-show)  

**KPIs Ops / Exécution**  
- **% commandes livrées** / commandes confirmées  
- **Temps « confirmé → livré »**  
- **Taux d'adresse complète au 1er essai**  
- **Taux d'erreurs bot / messages échoués** (délivrabilité WhatsApp)  

**KPIs Adoption (seller side)**  
- **Activation :** vendeur qui fait son 1er live avec SnapSell (au moins X réservations)  
- **WAU sellers** (vendeurs actifs hebdo)  
- **Lives par vendeur / semaine**  
- **Commandes via SnapSell / total commandes** (self-reported ou estimé)

---

## MVP Scope

### Problème central à résoudre

Transformer un live (sur n'importe quel canal) + des DM WhatsApp en **commandes fiables**, en supprimant :

- le chaos « premier arrivé / disputes »
- les **réservations fantômes**
- la charge mentale de mémoriser codes ↔ articles
- le tri manuel après le live

### Core Features (must-have, P0)

**Critère MVP :** Un vendeur peut (1) vendre en live uniquement avec WhatsApp (sans dashboard obligatoire), (2) utiliser un **système de codes lié aux catégories/prix** (A/B/C → prix), (3) gérer **pièces uniques + stock préparé** avec le même système de codes, (4) obtenir à la fin une **liste de commandes propre** dans le web dashboard.

**A) WhatsApp (Twilio) — le checkout unique**  
- Webhook Twilio + vérif signature + idempotence (MessageSid + tenant)  
- Routing vendeur vs client (numéros vendeurs connus)  
- Parser intents v1 : vendeur → créer stock préparé, créer item live, LIVE ON/OFF (optionnel), commandes paiement (optionnel) ; client → code, adresse, OUI, STOP  

**B) Pricing par catégories + codes**  
- Grille catégories globale tenant (ex. A=5000, B=10000, C=15000…)  
- Codes format libre (A12, B7…) ; règle **prix = lettre du code** partout  
- Unicité code par (tenant_id, live_session_id, code)  

**C) Deux modes produits (même système de codes)**  
1. **Unique (default) :** un code non préparé = quantité 1  
2. **Stock préparé via WhatsApp vendeur :** Photo + `CODE xQTE` (+ tailles/couleurs optionnelles) ; stock décrémenté automatiquement à chaque réservation/commande  

**D) Réservation + anti-fantômes**  
- Réservation atomique + waitlist + TTL configurable (5–15 min)  
- Rappel T-2 min + expiration T=0 + auto-promotion waitlist  
- **Acompte recommandé pour réserver :** bot propose un dépôt (montant fixe ou % simple) ; preuve paiement (image/texte) liée à la commande ; vendeur valide/refuse  

**E) Commandes & statuts**  
- Création commande + numéro VF-XXXX  
- Statuts minimum : new → confirmed → delivered/cancelled  
- Notifications WhatsApp statut (transactionnel)  

**F) Web App (orientée produit + ops)**  
- Landing « présentation produit »  
- Subscription / entitlements simples (même manuel au début)  
- Dashboard minimal : liste commandes + statuts + filtres ; Live Ops minimal (voir items/codes, réservations, libérer si besoin) ; Proofs inbox (valider/refuser)  

**G) Fiabilité Ops (MVP)**  
- Outbox DB + retries + DLQ (messages sortants)  
- Logs d'événements (correlationId)  
- File erreurs minimale (media non attaché, envoi échoué)  

---

### Out of Scope for MVP

- Multi-canal natif (IG/TikTok inbox). **Le live est ailleurs, checkout = WhatsApp uniquement**
- Boutons/menus WhatsApp avancés (si dispo → bonus, pas requis)
- Catalogue e-commerce complet (collections, search avancé, variantes complexes)
- Paiement automatisé (CinetPay/PayDunya) et reconciliation bancaire
- Livraison intégrée coursier + tracking temps réel
- Analytics avancés / cohortes / CRM
- Multi-numéros WhatsApp par tenant
- Temps réel WebSocket/SSE (polling suffit)

---

### MVP Success Criteria (go/no-go)

**Adoption & usage**  
- ≥ 60 % des ventes live passent par SnapSell (codes → commandes)  
- Temps « code envoyé → réservation » P95 < 2 s  
- Temps « réservation → commande confirmée » médiane < 5 min  

**Qualité & anti-chaos**  
- 0 double attribution sur pièces uniques (audit)  
- Réduction nette des disputes « premier arrivé » (qualitatif vendeur)  
- Taux de réservations fantômes ↓ (mesuré via expirations sans acompte)  

**Paiement & engagement**  
- % commandes avec acompte (objectif à définir selon vendeurs)  
- Délai validation preuve acceptable + satisfaction vendeur  

**Business (3 mois)**  
- X vendeurs actifs hebdo (ex. 10–20)  
- Rétention M1 > 60 % sur cohorte pilote  
- Coût WhatsApp / vendeur sous seuil cible  

---

### Future Vision (12–24 mois)

- **Omnicanal « signals » :** le live peut venir de TikTok/IG/Snap ; WhatsApp reste checkout + plus d'automations  
- **Catalogue accéléré :** import CSV / Google Sheets ; enrichissement automatique post-live (transformer codes uniques invendus en fiches)  
- **Paiements :** lien de paiement + webhooks ; règles d'acompte adaptatives (articles rares → acompte obligatoire)  
- **Scalabilité :** workers horizontaux + Redis/broker si nécessaire ; SSE/WebSocket pour Live Ops  
- **Ops avancées :** multi-agents, assignation, SLA, templates configurables ; analytics sur confirmations, no-show, zones
