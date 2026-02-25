# Descriptions Meta App Review — SnapSell

## 1. whatsapp_business_messaging

### Description (à coller dans le champ Meta)

SnapSell est une plateforme SaaS qui permet aux vendeurs e-commerce de gérer leurs conversations WhatsApp Business depuis un tableau de bord unifié. La permission `whatsapp_business_messaging` est utilisée pour :

1. **Recevoir les messages entrants** des clients via les webhooks Meta (POST /api/webhooks/meta). Lorsqu'un client envoie un message WhatsApp au numéro professionnel du vendeur, SnapSell reçoit le payload du webhook, vérifie la signature HMAC-SHA256, et stocke le message en base de données pour que le vendeur puisse le lire depuis son tableau de bord.

2. **Envoyer des messages sortants** au nom du vendeur vers ses clients. Lorsqu'un vendeur répond depuis le tableau de bord SnapSell, l'application appelle l'API WhatsApp Cloud (`POST https://graph.facebook.com/v21.0/{phone_number_id}/messages`) en utilisant le token business du vendeur. Types de messages supportés : texte, image, document.

3. **Envoyer des messages template** pour les conversations en dehors de la fenêtre de 24 heures, en utilisant des templates de messages pré-approuvés par Meta.

Toutes les identifiants (Phone Number ID, Access Token) sont stockés par tenant (vendeur) et sont limités à leur propre compte WhatsApp Business. SnapSell n'envoie jamais de messages sans une action explicite du vendeur authentifié.

---

### Comment faire la vidéo 1 (message envoyé et reçu)

**Objectif :** montrer qu'un message est envoyé via l'API WhatsApp Cloud et reçu dans WhatsApp.

**Méthode recommandée (alternative acceptée par Meta) :**
1. Ouvre App Dashboard → WhatsApp → API Setup
2. Copie le cURL d'envoi de message (pré-rempli avec ton numéro test et ton token)
3. Fais un enregistrement d'écran en exécutant ce cURL dans le terminal
4. Montre le téléphone qui reçoit le message en temps réel

> SnapSell ne dispose pas encore d'une interface d'envoi de messages dans le dashboard.
> L'API WhatsApp Cloud est appelée côté serveur (webhook entrant → réponse automatique).
> La démonstration via cURL est explicitement acceptée par Meta.

---

## 2. whatsapp_business_management

### Description (à coller dans le champ Meta)

SnapSell utilise la permission `whatsapp_business_management` pour gérer les actifs des comptes WhatsApp Business au nom des vendeurs intégrés. Plus précisément :

1. **Intégration des nouveaux vendeurs via l'Embedded Signup** — lorsqu'un vendeur clique sur "Connecter WhatsApp" dans la page des paramètres SnapSell, le flux Embedded Signup s'ouvre. Une fois complété, SnapSell échange le code retourné contre un token d'intégration business, stocke le WABA ID et le Phone Number ID, et abonne l'application aux webhooks du compte WABA du vendeur.

2. **Stockage et gestion de la configuration par tenant** — le compte WhatsApp Business (WABA ID) et le Phone Number ID de chaque vendeur sont stockés de manière sécurisée en base de données, isolés par tenant. Les vendeurs peuvent consulter et mettre à jour leur statut de connexion WhatsApp depuis la page des paramètres.

3. **Abonnement aux webhooks** — après l'intégration, SnapSell s'abonne au champ webhook `messages` sur le WABA de chaque vendeur afin que les messages entrants soient transmis à l'endpoint webhook de SnapSell.

Cette permission n'est jamais utilisée pour accéder aux données de comptes WABA que le vendeur n'a pas explicitement connectés à SnapSell via le flux Embedded Signup.

---

### Comment faire la vidéo 2 (création d'un template)

**Objectif :** montrer la création d'un template depuis ton app OU depuis WhatsApp Manager.

**Option A — Depuis WhatsApp Manager (le plus simple, accepté par Meta) :**
1. Va sur business.facebook.com → WhatsApp Manager → Modèles de messages
2. Clique "Créer un modèle"
3. Remplis : nom, catégorie (ex: UTILITY), langue (Français), corps du message
4. Soumets le modèle
5. Filme tout le processus du début à la fin

**Option B — Depuis SnapSell (si tu as une interface de gestion des templates) :**
- Si tu n'as pas encore d'interface de gestion des templates dans SnapSell, utilise l'Option A.

---

## 3. public_profile

### Description (à coller dans le champ Meta)

SnapSell utilise `public_profile` dans le cadre du flux standard Facebook Login for Business intégré à l'Embedded Signup WhatsApp. Cette permission est requise par le SDK Meta pour identifier l'utilisateur authentifié qui complète le flux Embedded Signup. SnapSell ne stocke pas, n'affiche pas et ne traite pas les données de profil personnel (nom, photo, etc.) du compte Facebook de l'utilisateur. Cette permission est utilisée uniquement pour authentifier la session pendant le flux OAuth de l'Embedded Signup.

### Vidéo requise pour public_profile
Aucune vidéo supplémentaire n'est requise pour `public_profile` — c'est une permission de base incluse automatiquement dans le flux Embedded Signup. Meta n'exige pas de démonstration vidéo séparée pour cette permission.

---

## Conseils pour les vidéos

- **Durée :** 2 à 5 minutes maximum, claires et sans coupures
- **Outil recommandé :** QuickTime (Mac) → Fichier → Nouvel enregistrement d'écran
- **Format accepté :** MP4 ou MOV
- **Ce qu'il faut montrer clairement :**
  - L'URL de ton application dans la barre du navigateur (pour prouver que c'est bien ton app)
  - L'action complète du début à la fin, sans sauts ni coupures
  - Le résultat final (message reçu sur le téléphone, template créé, etc.)
- **Astuce pour la vidéo 1 :** filme ton écran et un téléphone physique côte à côte pour montrer la réception du message en temps réel
