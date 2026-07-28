# Story 5.3: Valider ou refuser une preuve d'acompte

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **vendeur ou agent**,
I want **valider ou refuser une preuve d'acompte liée à une commande**,
so that **la commande passe en « confirmée » ou que la cliente soit notifiée du refus**.

## Acceptance Criteria

1. **Given** une commande en « confirmed_pending_deposit » avec une preuve (image/texte) reçue  
   **When** le vendeur/agent valide ou refuse la preuve dans le dashboard  
   **Then** le statut de la preuve est mis à jour (approved/rejected) et la commande passe en confirmed si approuvée ; la cliente est notifiée par WhatsApp (FR26)  
   **And** FR26 couvert

## Tasks / Subtasks

- [x] Task 1 : Modèle et persistance des preuves (AC: #1)
  - [x] Définir ou compléter le modèle de données pour les preuves d'acompte : soit table `payment_proofs` (orderId, mediaUrl ou payload texte, status: pending | approved | rejected, reviewedAt, correlationId), soit champs sur Order si une seule preuve par commande. Aligner avec architecture §3 (Order + PaymentProof) et §8 (Media R2, signed URLs).
  - [x] Si preuve reçue par WhatsApp (client envoie image) : s'assurer que le worker ou un job enregistre la preuve (upload R2 → URL en DB, statut pending). Si pas encore implémenté, documenter le flux et créer la table + migration.
  - [x] Procédures tRPC ou étendre `orders` : liste des commandes avec preuve en attente ; valider / refuser une preuve (mise à jour statut preuve + Order.depositStatus + Order.status si approuvée).

- [x] Task 2 : Transitions et event log (AC: #1)
  - [x] Lors de validation : Order.depositStatus → deposit_approved, Order.status → confirmed (depuis confirmed_pending_deposit). Enregistrer event_log (ex. `deposit.approved` ou `order.deposit_approved`) avec correlationId.
  - [x] Lors de refus : Order.depositStatus → deposit_rejected. Enregistrer event_log (ex. `deposit.rejected`). La commande reste en confirmed_pending_deposit ou passe à un état « refus acompte » selon produit ; notifier la cliente.

- [x] Task 3 : Notification WhatsApp (AC: #1)
  - [x] Après validation : écrire en outbox un message à la cliente (template type « Ta commande SS-XXXX est confirmée »).
  - [x] Après refus : écrire en outbox un message à la cliente (template type « Ta preuve d'acompte pour SS-XXXX n'a pas été acceptée. Réenvoie une preuve ou contacte le vendeur. »). Utiliser writeToOutbox(tenantId, to, body, correlationId).

- [x] Task 4 : Dashboard Proofs (AC: #1)
  - [x] Page `/dashboard/proofs` : remplacer le placeholder « À venir » par une liste des commandes en attente de preuve (deposit_pending) avec preuve reçue (image ou texte affiché).
  - [x] Pour chaque ligne : afficher commande (SS-XXXX), client, preuve (image via signed URL R2 ou texte), boutons « Valider » / « Refuser ». Accessibilité : aria-label, StatusBadge cohérent avec 5.2.

- [x] Task 5 : Tests (AC: #1)
  - [x] Tests unitaires ou d'intégration : valider preuve (deposit_approved, status → confirmed, event log, outbox contient message) ; refuser preuve (deposit_rejected, event log, outbox contient message). Isolation tenant.

## Dev Notes

- **Source :** [Source: _bmad-output/planning-artifacts/epics.md] — Epic 5, Story 5.3 ; FR26.
- **Contexte :** Les commandes en `confirmed_pending_deposit` existent déjà (5.1 / 4.5). La preuve peut être reçue par WhatsApp (client envoie une photo après demande d'acompte) ; le stockage média (R2) et le lien Order ↔ preuve doivent être en place ou créés dans cette story. Architecture §8 : « Media (preuves/photos) : Cloudflare R2 avec chemins en DB ; signed URLs pour Proofs Inbox ».
- **Périmètre :** Valider/refuser côté dashboard ; mise à jour Order + preuve ; notifications outbox. Pas de réception de la preuve par WhatsApp dans cette story si déjà couvert ailleurs ; sinon inclure le flux « message client avec media → enregistrement preuve (pending) ».

### Project Structure Notes

- **Fichiers à créer/modifier :**  
  - `prisma/schema.prisma` : modèle PaymentProof (ou équivalent) si absent — orderId, status (pending/approved/rejected), mediaUrl ou mediaKey (R2), reviewedAt, correlationId.  
  - `src/server/api/routers/proofs.ts` (nouveau) ou étendre `orders.ts` : listPendingProofs, approveProof, rejectProof.  
  - `src/server/api/root.ts` : enregistrer proofsRouter si nouveau.  
  - `src/server/events/eventLog.ts` : event types deposit_approved, deposit_rejected.  
  - `src/app/(dashboard)/dashboard/proofs/page.tsx` : liste + Valider/Refuser (composant client pour mutations).  
  - Réutilisation : writeToOutbox, orders.list/getById, patterns 5.2 (StatusBadge, tenantId contexte).
- **Références :** [Source: _bmad-output/planning-artifacts/architecture.md] §3 Order + PaymentProof ; §4.3 Confirm → acompte state ; §8 Data Storage (R2, signed URLs) ; Requirements to Structure Mapping — Commandes/preuves (FR26) → orders.ts, proofs.ts.

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **FR26 :** Le vendeur (ou agent) peut valider ou refuser une preuve d'acompte liée à une commande. En dashboard : voir les preuves en attente, cliquer Valider ou Refuser ; la commande passe en confirmed (si validé) et la cliente est notifiée par WhatsApp ; si refus, elle est notifiée du refus.
- **Flux existant :** Order créé en confirmed_pending_deposit + deposit_pending (4.5/5.1) ; demande de preuve envoyée au client (outbox). La réception de la preuve (client envoie image sur WhatsApp → stockage R2, création enregistrement preuve en pending) peut être dans 4.5/5.1 ou à faire en 5.3 ; clarifier avec code existant (webhook-processor, media upload).

### Technical Requirements

- **Isolation tenant :** toutes les procédures filtrées par tenantId (contexte auth). Un vendeur ne voit/agit que sur les preuves de son tenant.
- **Transitions :** Valider → deposit_approved + status confirmed ; Refuser → deposit_rejected. Order.status ne passe à confirmed qu'à l'approbation. Refuser les actions si preuve déjà approved/rejected (idempotence ou TRPCError BAD_REQUEST).
- **Média :** Si preuve = image, URL stockée en DB (R2 key ou URL) ; dashboard utilise signed URL (R2 ou API dédiée) pour afficher l'image de façon sécurisée. Pas d'exposition publique des buckets.

### Architecture Compliance

- **Stack :** tRPC (proofs ou orders), Prisma, event_log, outbox (writeToOutbox). Pas de logique dans le webhook pour cette story (actions dashboard).
- **Event Log :** event_type deposit_approved / deposit_rejected avec entity_type order, entity_id, correlationId, payload minimal (orderId, decision).
- **DB :** snake_case ; contraintes et index cohérents. Modèle PaymentProof si introduit : relation Order 1 — n ou 1 — 1 selon règle métier (une preuve par commande en MVP).

### Library / Framework Requirements

- Aucune nouvelle dépendance. Utiliser tRPC, Prisma, eventLog, writeToOutbox existants. UI : shadcn/ui + Tailwind (comme 5.2). Signed URLs R2 : utiliser le client S3/R2 déjà configuré (voir .env R2_*).

### File Structure Requirements

- Router proofs : `src/server/api/routers/proofs.ts` (ou sous-routes dans orders). Page : `src/app/(dashboard)/dashboard/proofs/page.tsx`. Event log : `src/server/events/eventLog.ts` (étendre avec deposit_approved, deposit_rejected).

### Testing Requirements

- Tester approve : Order et preuve mis à jour, event log écrit, outbox contient un message vers la cliente. Tester reject : idem avec deposit_rejected et message de refus. Tester isolation tenant (un tenant ne peut pas valider la preuve d'un autre). Tester idempotence ou refus si preuve déjà traitée.

### Previous Story Intelligence (Story 5.1 & 5.2)

- **5.1 :** Création Order (SS-XXXX, confirmed_pending_deposit, deposit_pending), createOrderFromReservation, event order_created, deposit_requested. Pas de modèle PaymentProof dans le schéma actuel — à ajouter si les preuves (image/texte) ne sont pas encore persistées.
- **5.2 :** orders router (list, getById, updateStatus), page /dashboard/orders, event order.status_changed, patterns tenantId contexte, TRPCError, eventLog. Réutiliser les mêmes patterns pour proofs (list pending, approve, reject) et la page proofs. Ne pas dupliquer la logique de changement de statut Order pour delivered/cancelled (reste dans 5.2).

### Git Intelligence Summary

- Patterns : tenantId depuis contexte tRPC, TRPCError pour erreurs métier, event_log avec correlationId, writeToOutbox pour notifications. Page orders avec composant client pour mutations et refetch. Réutiliser pour proofs.

### Latest Tech Information

- Aucune mise à jour de librairie requise. Stack T3, Prisma, tRPC, R2 inchangés. Si signed URLs R2 pas encore utilisées, suivre la doc Cloudflare R2 / S3 getSignedUrl.

### Project Context Reference

- [Source: _bmad-output/planning-artifacts/architecture.md] §3 Order + PaymentProof ; §4.3 Confirm → acompte state ; §8 Media R2, signed URLs ; Requirements to Structure Mapping — proofs.ts. Page proofs actuelle : placeholder « Preuves d'acompte — À venir » à remplacer par liste des preuves en attente + Valider/Refuser.

### Story Completion Status

- **Status :** ready-for-dev
- **Completion note :** Ultimate context engine analysis completed - comprehensive developer guide created for proof validation (dashboard, Order transitions, notifications, event log).

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Task 1: Modèle PaymentProof (Prisma) avec status pending/approved/rejected, mediaStorageKey, textPayload, reviewedAt, correlationId. Migration 20260209280000_add_payment_proof_story_5_3. Router proofs (listPending, approve, reject). Fonction interne createPaymentProof pour tests / futur webhook.
- Task 2: logDepositApproved / logDepositRejected dans eventLog.ts ; transitions Order (deposit_approved + status confirmed, deposit_rejected) dans proofs.approve / proofs.reject.
- Task 3: writeToOutbox après approve (message confirmation) et reject (message refus).
- Task 4: Page /dashboard/proofs avec ProofsListContent (liste pending, Valider/Refuser, aria-label, StatusBadge « En attente »). Affichage texte ou « Image jointe » si mediaStorageKey (signed URL non implémentée, pas de nouvelle dépendance).
- Task 5: proofs.test.ts — approve/reject (event log + outbox), isolation tenant (NOT_FOUND autre tenant), idempotence (BAD_REQUEST si déjà traité).

### File List

- prisma/schema.prisma (PaymentProof, PaymentProofStatus, relation Order ↔ PaymentProof)
- prisma/migrations/20260209280000_add_payment_proof_story_5_3/migration.sql
- src/server/api/routers/proofs.schema.ts
- src/server/api/routers/proofs.ts
- src/server/api/routers/proofs.test.ts
- src/server/api/root.ts (proofsRouter)
- src/server/events/eventLog.ts (deposit_approved, deposit_rejected, logDepositApproved, logDepositRejected)
- src/server/proof/createPaymentProof.ts
- src/server/proof/createPaymentProof.test.ts
- src/app/api/proofs/[proofId]/media/route.ts (GET image preuve depuis R2, auth tenant)
- src/app/(dashboard)/dashboard/proofs/page.tsx
- src/app/(dashboard)/dashboard/proofs/_components/proofs-list-content.tsx
- _bmad-output/implementation-artifacts/sprint-status.yaml (5-3 → in-progress puis review puis done)

---

## Senior Developer Review (AI)

**Date :** 2026-02-08  
**Story :** 5-3-valider-ou-refuser-une-preuve-dacompte  
**Résultat :** Approve (après correctifs appliqués)

### Synthèse

- **Écarts Git vs File List :** Aucun écart bloquant pour les fichiers 5-3 (fichiers story cohérents avec les ajouts proofs/proof/eventLog).
- **Problèmes identifiés :** 2 High, 2 Medium, 3 Low. Tous les High et Medium ont été corrigés automatiquement.

### Action Items (traités)

1. **[HIGH] Event log — erreurs silencieuses** [proofs.ts]  
   `logDepositApproved` / `logDepositRejected` étaient appelés avec `.catch(() => {})`, perte de traçabilité en cas d’échec.  
   **Correctif :** `.catch((err) => { workerLogger.error(...); })` pour les deux.

2. **[HIGH] writeToOutbox après transaction** [proofs.ts]  
   En cas d’échec de `writeToOutbox` après commit, la mutation levait une exception alors que la preuve/commande étaient déjà mises à jour → UX incohérente (retry → « déjà traitée »).  
   **Correctif :** `try/catch` autour de `writeToOutbox`, log de l’erreur, retour du succès (notification peut être relancée manuellement / DLQ).

3. **[MEDIUM] listPending sans filtre order.depositStatus** [proofs.ts]  
   La tâche exige « commandes en attente de preuve (deposit_pending) ». Les preuves en pending étaient listées sans vérifier que la commande est encore en `deposit_pending`.  
   **Correctif :** `where: { ..., order: { depositStatus: "deposit_pending" } }` dans `listPending`.

4. **[MEDIUM] Test manquant pour approve si order pas en confirmed_pending_deposit** [proofs.test.ts]  
   Branche `proof.order.status !== "confirmed_pending_deposit"` non couverte.  
   **Correctif :** Ajout du test `returns BAD_REQUEST when order is not in confirmed_pending_deposit`.

### Action Items LOW (corrigés après revue)

- **Signed URL R2 / affichage image :** Route API `GET /api/proofs/[proofId]/media` ajoutée (session requise, stream R2 via GetObjectCommand). Dashboard affiche la vignette image avec lien « ouvrir dans un nouvel onglet ».
- **createPaymentProof non testé :** Fichier `src/server/proof/createPaymentProof.test.ts` ajouté (null si order absent / pas deposit_pending / payload vide ; création avec textPayload et/ou mediaStorageKey).
- **Flux WhatsApp → preuve :** Documenté en JSDoc dans `createPaymentProof.ts` (étapes : message entrant → trouver Order deposit_pending pour le client → upload R2 si media → createPaymentProof). À brancher dans webhook-processor quand souhaité.
