# Code Review — Story 1.5 : Configurer les frais de livraison (optionnel)

**Date** : 2026-02-05  
**Story** : 1-5 — Configurer les frais de livraison (optionnel)  
**Statut global** : **Conforme avec dérive de scope documentée** — l’implémentation actuelle (page dédiée, zones/communes Côte d’Ivoire) dépasse la story initiale (un montant optionnel sur la page Paramètres). Les AC et la sécurité sont respectés ; la story et le File List doivent être alignés sur l’implémentation.

---

## 1. Git vs Story File List

| Fichier dans le File List (story) | Présent / modifié dans le code |
|-----------------------------------|---------------------------------|
| `prisma/schema.prisma` — deliveryFeeCents sur Tenant | **Divergent** : plus de `deliveryFeeCents` ; modèles `DeliveryZone`, `DeliveryZoneCommune`, `DeliveryFeeCommune`. |
| `settings.ts` — getDeliveryConfig, setDeliveryConfig | **Absent** : procedures livraison retirées de settings ; router `delivery` utilisé à la place. |
| `settings.schema.ts` — setDeliveryConfigInputSchema | **Absent** : schéma livraison dans `delivery.schema.ts`. |
| `delivery-config-content.tsx` | **Absent** : fichier supprimé ; remplacé par `delivery-fees-content.tsx` (zones + communes). |
| `parametres/page.tsx` — section Grille + Livraison | **Divergent** : page Paramètres = Grille de prix seule ; plus de section livraison. |

**Fichiers réels impliqués (non listés ou partiellement listés dans la story)** :

- `prisma/schema.prisma` — modèles livraison (DeliveryZone, DeliveryZoneCommune, DeliveryFeeCommune).
- `prisma/migrations/20260205000000_add_tenant_delivery_fee_cents/`, `20260205100000_delivery_zones_communes/`.
- `src/server/api/routers/delivery.ts`, `delivery.schema.ts`.
- `src/server/api/root.ts` — enregistrement du router `delivery`.
- `src/app/(dashboard)/parametres/livraison/page.tsx`.
- `src/app/(dashboard)/parametres/_components/delivery-fees-content.tsx`.
- `src/app/(dashboard)/_components/app-sidebar.tsx` — lien « Frais de livraison » vers `/parametres/livraison`.

---

## 2. Critères d’acceptation

| AC | Statut | Commentaire |
|----|--------|-------------|
| Connecté au dashboard → accès config livraison → saisie montant ou règle (optionnel) → config enregistrée pour le tenant | **OK** | Page dédiée `/parametres/livraison`, zones (nom + prix + communes) et communes (nom + prix), enregistrement par tenant. |
| FR3 couvert | **OK** | Le vendeur/manager peut configurer les frais de livraison (ici par zone et par commune). |

---

## 3. Revue par tâche

### Task 1 : Modèle de données frais de livraison

| Point | Statut |
|-------|--------|
| Story : champ optionnel sur Tenant ou table dédiée | **Évolution** : pas de champ sur Tenant ; tables `DeliveryZone`, `DeliveryZoneCommune`, `DeliveryFeeCommune` (cohérent avec livraison par zone/commune). |
| Stockage en centimes | OK (`amountCents` partout). |
| Migrations sans casser l’existant | OK (migrations appliquées, colonne `delivery_fee_cents` retirée dans migration zones/communes). |

**Verdict** : Conforme à l’objectif « config livraison par tenant », avec un modèle plus riche que la story initiale. **À documenter** dans la story.

---

### Task 2 : API tRPC pour la config livraison

| Point | Statut |
|-------|--------|
| Story : getDeliveryConfig, setDeliveryConfig dans settings | **Évolution** : router dédié `delivery` avec getDeliveryZones, upsertDeliveryZone, deleteDeliveryZone, getDeliveryFeeCommunes, upsertDeliveryFeeCommune, deleteDeliveryFeeCommune, getInteriorDeliveryFee, setInteriorDeliveryFee. |
| protectedProcedure, tenantId uniquement depuis `ctx.session.user.tenantId` | OK (toutes les procedures utilisent `ctx.session.user.tenantId!`, aucun tenantId en entrée). |
| Validation Zod (montant ≥ 0, etc.) | OK (`delivery.schema.ts` : communeName, amountCents, zone name, etc.). |
| TRPCError (FORBIDDEN, BAD_REQUEST, NOT_FOUND) | OK. |
| RBAC canManageGrid | OK (`checkDeliveryAccess(role)` sur toutes les procedures). |

**Verdict** : Conforme (sécurité, isolation tenant, validation). **À documenter** : API livraison dans router `delivery`, pas dans `settings`.

---

### Task 3 : Section Paramètres / Frais de livraison dans le dashboard

| Point | Statut |
|-------|--------|
| Story : section sur la page `parametres/` (même page que la grille) | **Évolution** : page dédiée `/parametres/livraison` (choix produit documenté en session). |
| Formulaire : montant / règle optionnel, tRPC get/set | **Évolution** : formulaires zones (nom, prix, liste communes) et communes (nom, prix) ; tRPC delivery.*. |
| UI shadcn + Tailwind (Input, Button, Label, Card, Table, Dialog, AlertDialog) | OK (`delivery-fees-content.tsx`). |

**Verdict** : Conforme en termes de fonctionnalité et d’UI ; périmètre différent de la story (page dédiée). **À documenter** dans la story.

---

### Task 4 : RBAC et navigation

| Point | Statut |
|-------|--------|
| Même règle que la grille : Owner/Manager (canManageGrid) | OK (page livraison + router delivery). |
| Lien / onglet pour accéder à la config livraison | OK (sidebar « Frais de livraison » → `/parametres/livraison`). |
| Pas d’accès Agent pour la config livraison | OK (canManageGrid ; Agent redirigé si accès direct à l’URL). |

**Verdict** : Conforme.

---

## 4. Conformité architecture & sécurité

| Exigence | Statut |
|----------|--------|
| Isolation tenant (tenantId uniquement depuis session) | OK (delivery.ts : pas d’input tenantId). |
| RBAC Owner/Manager pour livraison | OK. |
| Pas d’API publique | OK (procedures protégées). |
| DB snake_case, Prisma @map | OK. |
| Zod pour les entrées, TRPCError pour les erreurs | OK. |

---

## 5. Points d’attention (qualité / cohérence)

| Sévérité | Description | Fichier / action suggérée |
|----------|-------------|----------------------------|
| **HAUTE** | File List de la story obsolète (settings, delivery-config-content, section sur parametres). | Mettre à jour le File List dans `1-5-configurer-les-frais-de-livraison-optionnel.md` pour refléter : delivery router, delivery-fees-content, page livraison, sidebar, schéma Prisma livraison. |
| **MOYENNE** | Tasks 1–3 marqués [x] alors que le modèle, l’API et l’emplacement (section vs page) ont évolué. | Ajouter une note en Dev Agent Record ou dans la story : « Implémentation étendue : page dédiée, zones et communes (Côte d’Ivoire) ; AC et FR3 respectés. » |
| **BASSE** | Aucun test unitaire ou d’intégration pour le router delivery (story : tests optionnels). | Optionnel : ajouter tests Zod sur `delivery.schema.ts` et/ou tests tRPC pour delivery (getDeliveryZones, upsertDeliveryFeeCommune, etc.). |
| **BASSE** | `deleteDeliveryFeeCommuneInputSchema` : `communeName: z.string()` sans trim/min. | Pour cohérence avec le reste du schéma, on peut réutiliser un `communeNameSchema` (trim, min(1), max(200)) ou au moins `.trim()`. |

---

## 6. Synthèse

- **AC** : Implémentés (config livraison enregistrée par tenant, FR3).
- **Sécurité** : Isolation tenant et RBAC corrects.
- **Décalage story / code** : La story décrit un montant optionnel sur la page Paramètres ; l’implémentation est une page dédiée avec zones et communes. C’est une évolution de scope assumée ; il reste à **mettre à jour la story et le File List** pour refléter l’état actuel (fichiers livraison, router `delivery`, page `/parametres/livraison`).

**Recommandation** : Mettre à jour le Dev Agent Record et le File List de la story 1.5, puis considérer la story **done** avec mention de l’évolution de scope.
