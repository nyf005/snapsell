# Code Review — Story 1.6 : Connecter WhatsApp (Twilio) au tenant

**Date** : 2026-02-05  
**Story** : 1-6 — Connecter WhatsApp (Twilio) au tenant  
**Statut global** : **Conforme** — AC et sécurité respectés. Quelques points à documenter et une correction appliquée (gestion P2002).

---

## 1. Git vs Story File List

La story n’a **aucun fichier listé** dans la section Dev Agent Record → File List. Fichiers réellement impliqués pour 1.6 :

| Fichier | Rôle |
|---------|------|
| `prisma/schema.prisma` | Champ `whatsappPhoneNumber` sur `Tenant` (unique, @map) |
| `prisma/migrations/20260205120000_add_tenant_whatsapp_phone/migration.sql` | Migration |
| `src/server/api/routers/settings.ts` | `getWhatsAppConfig`, `setWhatsAppConfig` (protectedProcedure, RBAC, tenantId session) |
| `src/server/api/routers/settings.schema.ts` | `setWhatsAppConfigInputSchema`, validation E.164 |
| `src/app/(dashboard)/parametres/whatsapp/page.tsx` | Page protégée canManageGrid, rendu `WhatsAppConfigContent` |
| `src/app/(dashboard)/parametres/_components/whatsapp-config-content.tsx` | Formulaire numéro, tRPC get/set, Alert/Badge/Card (shadcn) |
| `src/app/(dashboard)/_components/app-sidebar.tsx` | Lien « Connexion WhatsApp » vers `/parametres/whatsapp`, `requiresGridRole: true` |

**Discrepancy** : File List vide → **MEDIUM** (documentation incomplète).

---

## 2. Critères d’acceptation

| AC | Statut | Preuve |
|----|--------|--------|
| Connecté au dashboard → saisie numéro WhatsApp (E.164) → tenant associé ; FR4 couvert | **OK** | Page `/parametres/whatsapp`, formulaire avec input E.164, mutation `setWhatsAppConfig` met à jour `Tenant.whatsappPhoneNumber` ; unicité vérifiée (findFirst + message CONFLICT). |
| Pas de compte Twilio / SID exposé au vendeur | **OK** | Un seul champ : numéro (E.164). Aucun champ SID/token. |

---

## 3. Revue par tâche

### Task 1 : Modèle de données liaison tenant ↔ numéro WhatsApp

| Point | Statut |
|-------|--------|
| Champ sur Tenant ou table dédiée | **OK** — `Tenant.whatsappPhoneNumber String? @unique @map("whatsapp_phone_number")`. |
| Un numéro = un seul tenant | **OK** — contrainte `@unique` + vérification applicative dans `setWhatsAppConfig`. |
| Migration sans casser l’existant | **OK** — migration additive (ADD COLUMN + UNIQUE). |

**Verdict** : Conforme.

---

### Task 2 : API tRPC pour la config WhatsApp

| Point | Statut |
|-------|--------|
| getWhatsAppConfig / setWhatsAppConfig, protectedProcedure | **OK** — `settings.ts` L88–108 et L111–156. |
| tenantId uniquement depuis `ctx.session.user.tenantId` | **OK** — aucun tenantId en input ; where/update utilisent `tenantId` de la session. |
| Validation Zod E.164 | **OK** — `settings.schema.ts` : regex `^\+[1-9]\d{6,14}$`, message d’erreur clair. |
| TRPCError (FORBIDDEN, BAD_REQUEST, CONFLICT) | **OK** — FORBIDDEN si pas canManageGrid, BAD_REQUEST si tenantId vide, CONFLICT si numéro déjà pris. |
| Refus si numéro déjà utilisé par un autre tenant | **OK** — findFirst + CONFLICT ; **+ correction CR** : catch Prisma P2002 (unique constraint) pour renvoyer le même message en cas de race. |

**Verdict** : Conforme ; erreur Prisma P2002 désormais gérée (voir §6).

---

### Task 3 : Section Paramètres / WhatsApp dans le dashboard

| Point | Statut |
|-------|--------|
| Section « Connexion WhatsApp » sous Paramètres | **OK** — page dédiée `/parametres/whatsapp`. |
| Accès Owner/Manager (canManageGrid) | **OK** — page + procedures tRPC. |
| Formulaire : numéro E.164 uniquement, pas de SID/code Twilio | **OK** — un seul input, placeholder + helper E.164. |
| Chargement / enregistrement tRPC, messages succès/erreur | **OK** — getWhatsAppConfig, setWhatsAppConfig, Alert destructive/success. |
| UI shadcn + Tailwind (Input, Button, Label, Card, Alert, Badge) | **OK** — `whatsapp-config-content.tsx`. |

**Verdict** : Conforme.

---

### Task 4 : RBAC et navigation

| Point | Statut |
|-------|--------|
| Même règle que grille / livraison : Owner/Manager uniquement | **OK** — canManageGrid côté page (redirect) et côté get/set WhatsApp. |
| Lien visible dans Paramètres ; section accessible comme le reste de la config | **OK** — sidebar « Connexion WhatsApp » avec `requiresGridRole: true`. |

**Verdict** : Conforme.

---

## 4. Conformité architecture & sécurité

| Exigence | Statut |
|----------|--------|
| Isolation tenant (tenantId uniquement depuis session) | **OK** |
| RBAC Owner/Manager pour config WhatsApp | **OK** |
| Pas d’API publique, pas de webhook dans cette story | **OK** |
| DB snake_case, Prisma @map | **OK** — `whatsapp_phone_number`. |
| Zod pour entrées, TRPCError pour erreurs | **OK** |
| §7.1 Config BSP : numéro dans config tenant | **OK** — champ sur Tenant. |

---

## 5. Problèmes identifiés et traitement

| Sévérité | Problème | Fichier / Ligne | Action |
|----------|----------|------------------|--------|
| **MEDIUM** | File List vide dans la story | Story Dev Agent Record | À mettre à jour avec la liste §1. |
| **MEDIUM** | Tâches non cochées alors que l’implémentation est faite | Story Tasks | Optionnel : cocher les tâches réalisées pour traçabilité. |
| **MEDIUM** (corrigé) | En cas de race (deux tenants enregistrent le même numéro), Prisma lève P2002 ; l’utilisateur voyait une erreur brute au lieu de « Ce numéro est déjà associé à un autre vendeur ». | `settings.ts` | **Corrigé** : try/catch sur `tenant.update`, si `PrismaClientKnownRequestError` et `code === "P2002"` → TRPCError CONFLICT avec le même message. |
| **LOW** | Aucun test unitaire ou d’intégration pour 1.6 (Zod E.164, get/set, unicité). | — | Story indique « optionnel MVP » ; recommandation : au moins un test Zod sur le schéma E.164. |
| **LOW** | `e164PhoneSchema` exporté dans `settings.schema.ts` mais jamais utilisé. | `settings.schema.ts` | Optionnel : retirer l’export ou l’utiliser (ex. réutilisation dans un formulaire côté client). |
| **LOW** | `useEffect` dans `whatsapp-config-content.tsx` réécrit `phone` à chaque changement de `data` ; en cas d’invalidation pendant la saisie, la saisie peut être écrasée. | `whatsapp-config-content.tsx` L50–54 | Optionnel : ne synchroniser serveur → local qu’au premier chargement ou au « Annuler ». |

---

## 6. Correction appliquée (P2002)

Dans `src/server/api/routers/settings.ts` :

- Import de `Prisma` depuis le client généré.
- Dans `setWhatsAppConfig`, la mutation est enveloppée dans un `try/catch` : en cas d’erreur Prisma `code === "P2002"` (violation de contrainte unique), on lance une `TRPCError` avec `code: "CONFLICT"` et le message « Ce numéro est déjà associé à un autre vendeur. ».

Cela aligne le comportement en cas de race avec le message déjà retourné par la vérification applicative.

---

## 7. Synthèse

- **AC** : Implémentés.
- **Sécurité / architecture** : Conformes (isolation tenant, RBAC, pas de SID exposé).
- **Documentation** : File List et statut des tâches à aligner avec l’implémentation.
- **Correction** : Gestion de l’erreur Prisma P2002 ajoutée.

**Suite (2026-02-05) :** Toutes les corrections ont été appliquées : File List et tâches cochées, statut story → done ; schema E.164 (E164_REGEX partagé, e164PhoneSchema trim avant refine) ; synchro initiale seule dans whatsapp-config-content (useRef) ; tests unitaires `settings.schema.test.ts` (11 tests). Sprint status 1-6 → done.
