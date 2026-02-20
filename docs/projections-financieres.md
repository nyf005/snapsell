# Projections Financières SnapSell

> Généré: 2026-02-20 | Devise: FCFA (1 USD ≈ 620 FCFA) | Hypothèses conservatrices

---

## 1. Grille tarifaire actuelle

| Plan     | Prix/mois   | Commandes incluses | Agents inclus | Overage        |
|----------|-------------|-------------------|---------------|----------------|
| Free     | 0 FCFA      | 50                | 0             | —              |
| Starter  | 25 000 FCFA | 300               | 1             | 75 FCFA/cmd    |
| Pro      | 50 000 FCFA | 700               | 5             | 100 FCFA/cmd   |

---

## 2. Coûts WhatsApp réels pour un tenant (modèle BYOW)

> Source : Meta Developer Docs + Omnichat Blog — Tarifs effectifs juillet 2025

### 2.1 Règle de facturation Meta (depuis juillet 2025 — per-message)

| Type de message | Dans la fenêtre 24h | Hors fenêtre 24h |
|-----------------|--------------------|--------------------|
| Message libre (texte) | **GRATUIT** | Interdit |
| Template Utility (confirmation commande, livraison) | **GRATUIT** | ~$0.005/msg |
| Template Marketing (promo, relance) | ~$0.008/msg | ~$0.008/msg |
| Template Authentication (OTP) | ~$0.007/msg | ~$0.007/msg |

**La fenêtre 24h s'ouvre chaque fois que le client envoie un message.**
Hors fenêtre = seuls les templates pré-approuvés sont autorisés.

### 2.2 Analyse du flux SnapSell

SnapSell est une plateforme **réactive** : c'est toujours le client qui initie en envoyant un code (ex. "A12"). Cela ouvre automatiquement la fenêtre 24h.

```
Client envoie "A12"  → fenêtre 24h ouverte → GRATUIT
Vendeur répond       → message libre        → GRATUIT  ✓
Confirmation résa    → utility template     → GRATUIT  ✓ (dans 24h)
Confirmation commande→ utility template     → GRATUIT  ✓ (dans 24h)
Rappel expiration    → utility template     → GRATUIT  ✓ (dans 24h)

Notification livraison (J+2) → utility template hors 24h → $0.005/msg ← seul coût réel
```

### 2.3 Estimation coût WhatsApp par profil de tenant

**Hypothèse : 30% des commandes reçoivent une notification hors fenêtre 24h (livraison J+2 ou J+3)**

#### Petit vendeur — 1 live/semaine, ~30 acheteurs/live
| Élément | Calcul | Coût |
|---------|--------|------|
| Messages entrants clients (4 lives × 30) | 120 → GRATUIT | $0.00 |
| Confirmations résa/commande (dans 24h) | → GRATUIT | $0.00 |
| Notifications livraison hors 24h (30% × 120) | 36 × $0.005 | $0.18 |
| **Total mensuel WhatsApp** | | **~$0.18 (~111 FCFA)** |

#### Vendeur moyen — 2 lives/semaine, ~80 acheteurs/live
| Élément | Calcul | Coût |
|---------|--------|------|
| Messages entrants (8 lives × 80) | 640 → GRATUIT | $0.00 |
| Notifications hors 24h (30% × 640) | 192 × $0.005 | $0.96 |
| **Total mensuel WhatsApp** | | **~$0.96 (~595 FCFA)** |

#### Gros vendeur — 5 lives/semaine, ~200 acheteurs/live
| Élément | Calcul | Coût |
|---------|--------|------|
| Messages entrants (20 lives × 200) | 4 000 → GRATUIT | $0.00 |
| Notifications hors 24h (30% × 4 000) | 1 200 × $0.005 | $6.00 |
| **Total mensuel WhatsApp** | | **~$6.00 (~3 720 FCFA)** |

### 2.4 Rapport WhatsApp / abonnement SnapSell

| Profil | Coût WhatsApp | Abonnement SnapSell | Ratio |
|--------|--------------|---------------------|-------|
| Petit vendeur | 111 FCFA | 25 000 FCFA (Starter) | **0,4%** |
| Vendeur moyen | 595 FCFA | 25 000 FCFA (Starter) | **2,4%** |
| Gros vendeur | 3 720 FCFA | 50 000 FCFA (Pro) | **7,4%** |

**Conclusion : le coût WhatsApp n'est PAS un frein.** Il est quasi-nul car SnapSell est une plateforme réactive (le client initie toujours), ce qui maintient les échanges dans la fenêtre gratuite. La seule dépense réelle est la notification de livraison, souvent hors 24h.

---

## 3. Modèle WhatsApp — BYOW vs BSP

### 2.1 Modèle actuel — BYOW (Bring Your Own WABA)

Chaque tenant utilise **ses propres credentials Meta** (phoneNumberId + accessToken stockés en DB).
Meta facture le tenant directement sur son compte WABA. **SnapSell = $0 de coût WhatsApp.**

```
Tenant → leur WABA Meta → SnapSell orchestre les appels API
                ↑
        Meta facture le tenant (pas SnapSell)
```

### 2.2 Modèle futur — BSP (Business Solution Provider)

SnapSell devient partenaire Meta officiel, gère les numéros sous son compte,
re-facture l'usage aux tenants avec une marge.

```
SnapSell BSP → 1 compte Meta Partner → N tenants hébergés
      ↑ Meta facture SnapSell à prix partenaire
      ↑ SnapSell re-facture tenants à prix retail (+20-30%)
```

**Tarification Meta BSP (Afrique de l'Ouest, indicatif 2025) :**

| Type de conversation           | Coût Meta (achat) | Prix SnapSell (vente +25%) | Marge nette |
|-------------------------------|-------------------|----------------------------|-------------|
| Initiée client (24h window)   | $0.00             | $0.00                      | $0.00       |
| Initiée business (marketing)  | $0.030            | $0.0375                    | $0.0075     |
| Initiée business (utility)    | $0.010            | $0.0125                    | $0.0025     |

> Seuil de pertinence BSP : 50+ tenants actifs + volume mensuel > 50 000 conversations.

---

## 4. Coûts infrastructure par phase

| Phase | Tenants | Railway | Vercel | Neon | Total infra/mois |
|-------|---------|---------|--------|------|-----------------|
| Lancement | 1–10 | $5 | $0 | $0 | **$5** (~3 100 FCFA) |
| Croissance | 10–50 | $5 | $0 | $15 | **$20** (~12 400 FCFA) |
| Scale | 50–200 | $10 | $20 | $15 | **$45** (~27 900 FCFA) |
| Grand scale | 200–500 | $20 | $20 | $30 | **$70** (~43 400 FCFA) |
| BSP | 500+ | $30 | $20 | $50 | **$100** (~62 000 FCFA) |

**Seuils de bascule :**
- **Neon Free → Launch ($15/mo)** : ~20–50 tenants (dépassement 0,5 GB storage)
- **Vercel Hobby → Pro ($20/mo)** : ~100–200 tenants actifs (dépassement 1M invocations/mois)
- **Railway scale** : horizontal si pic de jobs, actuellement 1 dyno suffit jusqu'à ~500 tenants

---

## 5. Projections revenus — Modèle BYOW (actuel)

### Hypothèse mix de plans (conservative)

| Phase | Tenants total | Free | Starter | Pro |
|-------|--------------|------|---------|-----|
| Lancement | 10 | 5 | 3 | 2 |
| Croissance | 50 | 20 | 20 | 10 |
| Scale | 200 | 60 | 100 | 40 |
| Grand scale | 500 | 100 | 300 | 100 |
| BSP | 1 000 | 150 | 600 | 250 |

### Revenus abonnements + overage estimé (hors WhatsApp)

> Overage estimé : 20% des tenants payants dépassent leur quota (moy. +100 cmds).

#### Phase Lancement (10 tenants)
| Source | Calcul | Montant |
|--------|--------|---------|
| Free | 5 × 0 | 0 FCFA |
| Starter | 3 × 25 000 | 75 000 FCFA |
| Pro | 2 × 50 000 | 100 000 FCFA |
| Overage (~1 tenant) | 100 cmds × 75 FCFA | 7 500 FCFA |
| **Total revenus** | | **182 500 FCFA** |
| Infra | | 3 100 FCFA |
| **Marge brute** | | **178 600 FCFA (97,9%)** |

#### Phase Croissance (50 tenants)
| Source | Calcul | Montant |
|--------|--------|---------|
| Starter | 20 × 25 000 | 500 000 FCFA |
| Pro | 10 × 50 000 | 500 000 FCFA |
| Overage (~5 tenants) | 5 × 100 × 80 FCFA | 40 000 FCFA |
| **Total revenus** | | **1 040 000 FCFA** |
| Infra | | 12 400 FCFA |
| **Marge brute** | | **1 027 600 FCFA (98,8%)** |

#### Phase Scale (200 tenants)
| Source | Calcul | Montant |
|--------|--------|---------|
| Starter | 100 × 25 000 | 2 500 000 FCFA |
| Pro | 40 × 50 000 | 2 000 000 FCFA |
| Overage (~25 tenants) | 25 × 100 × 85 FCFA | 212 500 FCFA |
| **Total revenus** | | **4 712 500 FCFA** |
| Infra | | 27 900 FCFA |
| **Marge brute** | | **4 684 600 FCFA (99,4%)** |

#### Phase Grand Scale (500 tenants)
| Source | Calcul | Montant |
|--------|--------|---------|
| Starter | 300 × 25 000 | 7 500 000 FCFA |
| Pro | 100 × 50 000 | 5 000 000 FCFA |
| Overage (~75 tenants) | 75 × 100 × 90 FCFA | 675 000 FCFA |
| **Total revenus** | | **13 175 000 FCFA** |
| Infra | | 43 400 FCFA |
| **Marge brute** | | **13 131 600 FCFA (99,7%)** |

---

## 6. Projections revenus — Modèle BSP (futur)

> Actif à partir de ~500 tenants. S'ajoute aux revenus abonnements.

#### Hypothèse BSP (1 000 tenants, 500 conversations marketing/tenant/mois)
| Source | Calcul | Montant |
|--------|--------|---------|
| Volume conversations | 1 000 × 500 | 500 000 conv/mois |
| Coût Meta (achat) | 500 000 × $0.030 | $15 000 (~9 300 000 FCFA) |
| Revenus Meta (vente) | 500 000 × $0.0375 | $18 750 (~11 625 000 FCFA) |
| **Marge WhatsApp brute** | | **2 325 000 FCFA** |
| Revenus abonnements | (voir phase 1 000 tenants) | ~26 000 000 FCFA |
| Infra + WhatsApp cost | 62 000 + 9 300 000 | ~9 362 000 FCFA |
| **Marge nette totale** | | **~19 000 000 FCFA (66%)** |

> La marge chute en BSP car SnapSell porte le coût WhatsApp. Le modèle BSP vaut si volume > 1M conversations/mois.

---

## 7. Vue synthétique — Croissance BYOW

```
Phase          Tenants  Revenus/mois     Infra/mois   Marge
──────────────────────────────────────────────────────────────
Lancement        10       182 500 FCFA     3 100 FCFA  97,9%
Croissance       50     1 040 000 FCFA    12 400 FCFA  98,8%
Scale           200     4 712 500 FCFA    27 900 FCFA  99,4%
Grand scale     500    13 175 000 FCFA    43 400 FCFA  99,7%
──────────────────────────────────────────────────────────────
BSP (futur)   1 000    28 325 000 FCFA  9 362 000 FCFA  66,9%
```

---

## 8. Recommandations stratégiques

### Court terme (0–50 tenants) → **BYOW, rester en Hobby**
- Railway Hobby : $5/mois → suffisant
- Vercel Hobby : $0 → aucun changement
- Neon Free : $0 → surveiller la taille DB (seuil 0,5 GB)
- **Action** : monitorer `pg_database_size()` mensuellement

### Moyen terme (50–200 tenants) → **Passer Neon Launch + Vercel Pro**
- Budget infra estimé : ~$45/mois (~27 900 FCFA)
- Revenus à ce stade : >4 500 000 FCFA/mois
- **Ratio infra/revenus : <0,7%**

### Long terme (200–500 tenants) → **Évaluer candidature BSP Meta**
- Contacter Meta Partner Program (nécessite 1 000+ utilisateurs actifs sur WABA)
- Préparer l'Epic BSP : nouveau onboarding, System User Token, re-facturation usage

### Levier de croissance WhatsApp : **BYOW simplifié**
- Créer un guide d'onboarding WABA pour les tenants (réduire la friction)
- Une documentation claire = plus de tenants = plus de revenus sans coût WhatsApp

---

*Document généré lors de la session Party Mode du 2026-02-20.*
*Hypothèses à réviser trimestriellement en fonction des métriques réelles.*
