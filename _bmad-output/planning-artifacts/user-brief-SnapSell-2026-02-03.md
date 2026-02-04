# SnapSell — Brief Projet (Web + WhatsApp)

## 1) Vision

SnapSell est une solution **WhatsApp-first** qui transforme n'importe quel live (TikTok, Instagram, Snapchat, Facebook, etc.) en **commandes structurées** sans chaos.
Le live se passe sur n'importe quelle plateforme, mais **le checkout est unique sur WhatsApp** : le client écrit un code, SnapSell réserve, collecte l'adresse, confirme la commande, puis suit le statut jusqu'à la livraison.

Le **web** sert de **console business & ops** : abonnement, configuration, suivi des commandes, preuve/acompte, erreurs et pilotage — pas comme porte d'entrée obligatoire pour vendre.

---

## 2) Problème

Les vendeurs de live commerce (souvent sans équipe) gèrent :

* des **centaines de produits uniques** (ex : 500 pièces, plusieurs fois par semaine),
* des DM/WhatsApp chaotiques ("moi je prends", doublons, disputes),
* des **réservations fantômes** (clients qui disparaissent),
* du stress opérationnel (qui a réservé quoi, à quel prix, à qui livrer).

Demander de **cataloguer chaque article avant** ou de saisir trop d'infos pendant le live tue l'adoption.

---

## 3) Solution : modèle hybride "Stock préparé" + "Flux improvisé"

SnapSell sépare ce qui est **prévisible** (stock en quantité) et ce qui est **imprévisible** (pièces uniques).

### A) Stock préparé (produits en quantité)

* Le vendeur **enregistre avant** (sur le web) les produits qu'il a en quantité :

  * **code produit** (ex: `S01`, ou `A20`, etc.)
  * **catégorie** (A/B/C…) → prix automatique
  * **quantité disponible**
  * photo + titre (recommandés)
* Pendant le live, il annonce simplement le code (ex: "envoyez S01 sur WhatsApp").
* Le bot :

  * retrouve le produit,
  * **décrémente la quantité**,
  * bloque/annonce "épuisé" si stock à 0.

### B) Flux improvisé (pièces uniques / nouveautés)

* Aucun catalogue préalable.
* Le vendeur colle une **étiquette code** sur l'article (ex : `A12`, `B07`).
* Le client envoie le code sur WhatsApp.
* Le bot :

  * comprend le code,
  * applique le prix via la **catégorie**,
  * traite l'article comme **unique (quantité = 1)**.

---

## 4) Prix : règle unique "Catégorie → Prix" (valable partout)

Le prix n'est **pas saisi en live**. Il est déterminé par une grille de catégories, configurable par vendeur.

* Exemple de grille :

  * **A = 5 000 FCFA**
  * **B = 10 000 FCFA**
  * **C = 15 000 FCFA**

**Règle :** le prix d'un produit = prix de sa catégorie (A/B/C…)

* Pour le **stock préparé** : le produit est enregistré avec sa catégorie + quantité.
* Pour l'**improvisé** : le code (ex: A12) suffit → A = prix.

---

## 5) Comment le vendeur "colle les tags" (codes) avant la vente

* Le vendeur utilise des **étiquettes physiques** (stickers) préimprimées ou écrites au marqueur :

  * Format simple : **LettreCatégorie + Numéro** (ex : A12, B07, C31)
* Il colle l'étiquette sur l'article **avant de le montrer** à la caméra.
* Il dit en live :

  * "Cette robe : code **A12** — envoyez **A12** sur WhatsApp."
* SnapSell n'a pas besoin "d'écouter le live" : tout revient via WhatsApp.

---

## 6) Parcours WhatsApp (Checkout unique)

Dès qu'un client envoie un code, SnapSell déroule automatiquement :

1. **Réservation**

* Si disponible → "Réservé pour toi (X min)."
* Si déjà réservé → "Tu es en file d'attente #N."

2. **Collecte livraison**

* Commune/quartier + point de repère (format Abidjan)
* Calcul automatique des frais via grille vendeur

3. **Confirmation**

* Récap : code, prix, frais, total, adresse → "Réponds OUI pour confirmer"

4. **Acompte recommandé (anti-fantômes)**

* Paiement principal = **à la livraison**
* Mais pour réserver sérieusement, SnapSell **recommande un acompte** (ex: 10–30% ou montant fixe) :

  * "Pour garder la réservation, envoie un acompte et la preuve (capture)."
* Sans acompte : réservation expire plus vite ou priorité plus faible (selon règle produit).

5. **Expiration + auto-promotion**

* Si pas de confirmation / pas d'acompte → expiration → libération → notification au #1 de la file.

---

## 7) Web App : rôle exact (orientée produit + abonnement + ops)

Le web n'est pas la "porte d'entrée live". Il sert à :

* **Présentation produit** (landing + valeur + pricing)
* **Subscription / entitlements** (plans, quotas, facturation)
* **Configuration**

  * grille catégories → prix
  * grille frais de livraison
  * paramètres TTL, règles acompte
  * connexion WhatsApp (Twilio WhatsApp)
* **Dashboard ops**

  * **liste des commandes** + statuts
  * validation preuve/acompte
  * exports CSV
  * logs / file d'erreurs (messages échoués, médias non attachés)

---

## 8) Ce qui rend SnapSell "unique"

* **Checkout WhatsApp unique**, peu importe la plateforme de live.
* **Aucune saisie lourde** pendant le live.
* **Prix automatique par catégorie** (A/B/C) + codes collés physiquement.
* **Réservation atomique + file + expiration** (anti-litiges).
* **Acompte recommandé** pour tuer les réservations fantômes.
* Un live éphémère devient une **liste propre de commandes livrables**.

---

## 9) MVP — ce qu'on livre en premier

* Intégration **Twilio WhatsApp**
* Parsing codes + intents (client et vendeur)
* Moteur live : réservation atomique + waitlist + TTL + rappel
* Commandes + statuts + notifications
* Paiement à la livraison + **acompte recommandé** + preuve (photo)
* Web app orientée : **landing + subscription + dashboard commandes**
