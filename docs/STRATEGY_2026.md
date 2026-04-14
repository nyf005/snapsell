# 📈 Synthèse Stratégique & Modèle Économique (2026)

## 1. Structure de Coûts Optimisée
Gracias a la arquitectura híbrida (IA Gemma 4 + Meta Cloud API), SnapSell bénéficie d'une structure de coûts extrêmement légère :
- **IA (Gemma 4 via OpenRouter)** : ~0,00005 $ / message. Impact négligeable (< 0,5 % du CA).
- **WhatsApp (Inbound Service)** : 0 FCA (Inclus dans les fenêtres gratuites de Meta pour les messages initiés par les clients).
- **Marge brute cible** : **94 %**.

## 2. Grille Tarifaire & Crédits d'Automatisation

Pour simplifier, on utilise une unité interne : le **Crédit d'Automatisation**.
- **1 Crédit** = 1 session de 24h avec un client (Meta Service Window).
- **Valeur unitaire suggérée** : 25 Fcfa (pour le calcul des recharges).
- **Les commandes sont illimitées** - seul le nombre de sessions client est limité.

| Plan | Prix Mensuel | Sessions/mois | IA | Overage |
| :--- | :--- | :--- | :--- | :--- |
| **Free** | 0 FCA | **70** | ❌ | Blocage session |
| **Starter** | 25 000 FCA | **500** | ✅ | 2 500 FCA / 100 sessions |
| **Pro** | 50 000 FCA | **1 500** | ✅ | 2 000 FCA / 100 sessions |

## 3. Simulation des Profils Utilisateurs

### 🎙️ Profil A : "Le Liver" (3 sessions / semaine)
- **Activité** : 12 Lives par mois.
- **Volume** : ~40 clients uniques par Live.
- **Consommation** : 480 sessions.
- **Verdict** : Le plan **Starter** est idéal. Il couvre pile son besoin mensuel.

### 🏪 Profil B : "Le Boutiquier" (Vente quotidienne)
- **Activité** : Flux continu, 7j/7.
- **Volume** : ~25 clients uniques par jour.
- **Consommation** : 750 sessions.
- **Verdict** : Le plan **Pro** est nécessaire. S'il reste en Starter, il devra acheter des recharges.

## 4. Facteurs de Risque & Mitigations
- **Dépendance Meta** : Risque de changement de tarification des "Service Windows".
    - *Mitigation* : Les limites de sessions dans les plans permettent de répercuter tout changement de coût sur le vendeur sans perte pour SnapSell.
- **Qualité de l'IA** : Risque d'hallucinations sur les prix ou stocks.
    - *Mitigation* : Utilisation des helpers déterministes obligatoires (`getTrustedAIProductIntent`). L'IA interprète, le serveur décide.

## 5. Roadmap Profitabilité
1. **Phase 1 (1-100 vendeurs)** : Focus sur l'API Cloud Meta Officielle pour une stabilité maximale.
2. **Phase 2 (100-500 vendeurs)** : Introduction de l'option "Porte-feuille WhatsApp" (le vendeur dépose 5000 Fcfa pour ses messages marketing).
3. **Phase 3 (+500 vendeurs)** : Exploration du mode "QR Code" (Baileys) pour les plans "Low Cost" afin de supprimer totalement les frais Meta si nécessaire.

## 6. Mise en œuvre Technique
Le détail des étapes à suivre pour implémenter ces quotas et le système de recharges est disponible dans le document :
👉 [Plan d'Implémentation : Système de Crédits](file:///Users/fabricendri/Developer/SnapSell/docs/CREDIT_SYSTEM_DEV_PLAN.md)

---
*Ce document sert de base pour les projections financières et les levées de fonds futures.*