# Plan d'implémentation : Variantes et Quantités Multiples

Ce document détaille la stratégie et le suivi de l'évolution de SnapSell pour supporter les variantes d'articles (tailles, couleurs, etc.) et les commandes clients à quantités multiples.

> ## ✅ Plan terminé
> Toutes les phases sont livrées. Ce document est conservé comme **trace de conception**, pas comme travail à faire.
>
> **Implémentation en place :** modèle `ItemVariant` (Prisma), `Reservation.quantity` et `Reservation.variantId`, [`variantSelection.ts`](../src/server/conversation/variantSelection.ts) pour le dialogue client, [`sellerVariantConfig.ts`](../src/server/conversation/sellerVariantConfig.ts) pour la configuration vendeur.

## Situation de départ _(avril 2026, avant ce chantier)_
- Un article était identifié uniquement par un `code` (A12).
- La gestion des variantes imposait au vendeur de créer des codes multiples.
- Les clients ne pouvaient réserver qu'une unité à la fois.
- Le système de stock était binaire (disponible/réservé) par unité de 1.

---

## Objectifs Cibles
1.  **Flexibilité :** Supporter des options optionnelles (Taille, Couleur) sans complexifier les articles simples.
2.  **Expérience Vendeur :** Garder la vitesse du "Live" intacte tout en offrant de la puissance "Hors Live".
3.  **Expérience Client :** Dialogue fluide pour choisir ses options et commander plusieurs unités d'un coup.
4.  **Précision :** Inventaire atomique au niveau de la variante.

---

## Plan de Route

### 🟩 Phase 1 : Fondations Data & Types
- [x] **Schéma Prisma :** 
    - [x] Ajouter le modèle `ItemVariant` (lié à `CatalogueItem` et `LiveItem`).
    - [x] Ajouter un champ `attributes` (JSON) sur l'article pour définir les dimensions (ex: `["Taille", "Couleur"]`).
    - [x] Ajouter `quantity` sur le modèle `Reservation`.
- [x] **Logique Core :** 
    - [x] Mettre à jour les fonctions de stock (`reserveUnits`) pour supporter des quantités > 1.
    - [x] Gérer l'atomicité des réservations sur les variantes.

### 🟦 Phase 2 : Expérience Vendeur (Gestion)
- [x] **Hors Live (Préparation) :** 
    - [x] Proposer un CTA "Configurer Variantes" après l'ajout d'un article.
    - [x] (Dashboard logic simulated via worker logic).
- [x] **En Live (Vitesse) :** 
    - [x] Maintenir la syntaxe `A12 x3` (Zéro friction).

### 🟨 Phase 3 : Expérience Client (Achat)
- [x] **Parser :** Extraire la quantité (`A12 x3`) et l'intent.
- [x] **Flux Interactif :** Si variantes détectées, déclencher le questionnement par étapes (Couleur ? Taille ?).
- [x] **Réservation :** Créer la réservation atomique sur le `variantId` et la quantité choisie.

### 🟧 Phase 4 : Consolidation & Ordres
- [x] **Récapitulatif :** Afficher le détail de la variante et la quantité dans le récap de commande.
- [x] **Order Creation :** Valider que la conversion réservation -> commande respecte la variante et la quantité.
- [x] **Tests :** Mettre à jour la suite de tests (`service.test.ts`, `reservation.test.ts`) pour couvrir les nouveaux paramètres.
- [x] **Récapitulatif :** 
    - [x] Mettre à jour les templates de message pour afficher quantités et variantes sélectionnées.

---

## Suivi des Étapes
*Utilisez cette section pour noter toute décision architecturale prise en cours de route.*

- **11 avril 2026** — Initialisation du plan.
- **28 juillet 2026** — Plan clôturé : les 4 phases sont livrées et vérifiées dans le code. La syntaxe `A12 x3` et le questionnement par étapes sont en production.
