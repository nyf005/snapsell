# Story 5.4: Notifier la cliente par WhatsApp des changements de statut

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **système**,
I want **notifier la cliente par WhatsApp des changements de statut de sa commande (confirmé, livré, etc.)**,
so that **elle soit informée sans relancer**.

## Acceptance Criteria

1. **Given** une commande dont le statut change (confirmé, livré, annulé)  
   **When** le statut est mis à jour  
   **Then** un message de notification est écrit en outbox et envoyé à la cliente (FR27)  
   **And** FR27 couvert

## Tasks / Subtasks

- [x] Task 1 : Notification sur changement de statut (AC: #1)
  - [x] Dans `orders.updateStatus` : après persistance du nouveau statut et écriture event_log, récupérer le numéro client (order → reservation.clientPhone). Appeler `writeToOutbox({ tenantId, to: clientPhone, body: template, correlationId })` avec un message adapté au nouveau statut (delivered, cancelled).
  - [x] Ne pas notifier pour les transitions qui ont déjà déclenché une notif ailleurs : « confirmé » après validation de preuve est déjà envoyé par proofs.approve (5.3). Ici couvrir uniquement les statuts mis à jour via updateStatus : **delivered** et **cancelled**.
  - [x] Gérer l’échec de writeToOutbox comme en 5.3 (try/catch, log, ne pas faire échouer la mutation ; notification peut être relancée / DLQ).

- [x] Task 2 : Templates de message (AC: #1)
  - [x] Définir (ou réutiliser) des libellés courts et clairs pour la cliente, ex. : « Ta commande SS-XXXX est livrée. » ; « Ta commande SS-XXXX a été annulée. » Utiliser le numéro de commande (order.orderNumber) dans le message.
  - [x] Aligner avec les templates existants (proofs 5.3, createOrderFromReservation 5.1) : ton professionnel, pas de données sensibles.

- [x] Task 3 : Respect du STOP (opt-out) (AC: #1)
  - [x] L’envoi réel est fait par le worker outbox-sender, qui consulte déjà OptOut (archi §7, FR46). Aucun changement côté outbox-sender ; s’assurer que writeToOutbox est bien utilisé (pas d’envoi direct Twilio). Si le client a envoyé STOP, le message restera en outbox puis sera marqué blocked par le worker — pas de code spécifique dans orders.

- [x] Task 4 : Tests (AC: #1)
  - [x] Tests unitaires ou d’intégration : updateStatus vers delivered → outbox contient un message vers la cliente avec corps contenant « livrée » et orderNumber ; updateStatus vers cancelled → idem avec « annulée ». Isolation tenant. Si writeToOutbox échoue, la mutation updateStatus réussit et le statut est bien persisté (comportement comme 5.3).

## Dev Notes

- **Source :** [Source: _bmad-output/planning-artifacts/epics.md] — Epic 5, Story 5.4 ; FR27.
- **Contexte :** En 5.2, updateStatus persiste le statut et écrit event_log ; la notification cliente était explicitement laissée à cette story. En 5.3, approve/reject envoient déjà un message WhatsApp (confirmée / preuve refusée). Cette story complète le flux : chaque changement de statut pertinent pour la cliente (livré, annulé) doit générer une entrée en outbox.
- **Périmètre :** Uniquement les notifications déclenchées par le **changement de statut** (updateStatus). Pas de modification du flux de création de commande (5.1) ni de validation de preuve (5.3).

### Project Structure Notes

- **Fichiers à modifier :**  
  - `src/server/api/routers/orders.ts` : dans `updateStatus`, après la transaction de mise à jour et l’appel à `logOrderStatusChanged`, charger l’order avec `reservation: { select: { clientPhone: true } }` si pas déjà chargé, puis appeler `writeToOutbox` pour delivered/cancelled avec un corps dérivé de l’order (orderNumber, nouveau statut).
  - Optionnel : centraliser les templates « statut commande » dans un module partagé (ex. `src/server/whatsapp/templates.ts` ou équivalent) si ce n’est pas déjà le cas — sinon libellés inline dans orders.ts acceptables pour le MVP.
- **Références :** [Source: _bmad-output/planning-artifacts/architecture.md] §4.5 Outbound messaging via outbox ; §7 STOP ; Requirements to Structure Mapping — FR27 → orders.ts + outbox.

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **FR27 :** Le système peut notifier la cliente par WhatsApp des changements de statut de sa commande. En pratique : lorsque le vendeur/agent met à jour le statut (delivered, cancelled) via le dashboard, la cliente reçoit un message WhatsApp (via outbox). Les notifications « commande confirmée » et « preuve refusée » sont déjà gérées en 5.3 ; ne pas les dupliquer.
- **Flux existant :** orders.updateStatus (5.2) fait déjà : vérification des transitions, mise à jour en base, logOrderStatusChanged. Il manque uniquement l’appel à writeToOutbox avec le bon destinataire (reservation.clientPhone) et le bon texte.

### Technical Requirements

- **Isolation tenant :** updateStatus utilise déjà le tenantId du contexte ; writeToOutbox recevra ce tenantId. Le numéro client vient de la commande (reservation.clientPhone), pas du body.
- **Transitions notifiées :** uniquement lorsque le **nouveau** statut est `delivered` ou `cancelled`. Pas d’envoi si on ajoute plus tard d’autres statuts intermédiaires sans exigence de notification.
- **Cohérence avec 5.3 :** en cas d’échec de writeToOutbox, ne pas faire échouer la mutation (log + retour succès), pour éviter que le dashboard affiche une erreur alors que le statut a bien été mis à jour.

### Architecture Compliance

- **Stack :** tRPC (orders.updateStatus), Prisma, event_log, outbox (writeToOutbox). Pas d’appel direct à Twilio ; tout passe par l’outbox (archi §4.5).
- **Event Log :** déjà en place (logOrderStatusChanged) ; pas de nouvel event_type requis pour cette story.
- **STOP / opt-out :** géré par le worker outbox-sender ; aucune logique supplémentaire dans orders.

### Library / Framework Requirements

- Aucune nouvelle dépendance. Réutiliser `writeToOutbox` depuis `~/server/messaging/outbox` comme dans proofs.ts et createOrderFromReservation.ts.

### File Structure Requirements

- Modifications limitées à `src/server/api/routers/orders.ts` (et éventuellement un fichier de templates partagés si vous en introduisez un). Tests dans `orders.test.ts` ou fichier dédié.

### Testing Requirements

- Tester updateStatus → delivered : ordre mis à jour, event_log écrit, writeToOutbox appelé une fois avec to = clientPhone du reservation, body contenant le numéro de commande et un libellé type « livrée ».
- Tester updateStatus → cancelled : idem avec libellé type « annulée ».
- Tester isolation tenant (commande d’un autre tenant → NOT_FOUND, pas d’envoi).
- Tester que si writeToOutbox lance une erreur, la mutation ne remonte pas l’erreur (statut et event_log restent persistés).

### Previous Story Intelligence (Story 5.2 & 5.3)

- **5.2 :** orders.updateStatus avec transitions confirmed | confirmed_pending_deposit → delivered | cancelled ; logOrderStatusChanged ; pas de writeToOutbox. Liste/getById incluent déjà reservation.clientPhone — pour updateStatus, il faut soit inclure reservation dans le findFirst, soit faire un second findFirst avec include pour obtenir clientPhone après la mise à jour.
- **5.3 :** writeToOutbox après approve/reject avec try/catch pour ne pas faire échouer la mutation en cas d’échec outbox. Réutiliser le même pattern (try/catch, log, return success).

### Git Intelligence Summary

- writeToOutbox est utilisé dans proofs.ts, createOrderFromReservation.ts, webhook-processor.ts, reservation-ttl.ts. Signature : `writeToOutbox({ tenantId, to, body, correlationId })`. Ne pas réinventer ; importer depuis `~/server/messaging/outbox`.

### Latest Tech Information

- Aucune mise à jour de librairie requise. Stack T3, Prisma, tRPC, outbox inchangés.

### Project Context Reference

- [Source: _bmad-output/planning-artifacts/architecture.md] §4.5 Outbound messaging via outbox + retries + DLQ ; §7 STOP (scope tenant). [Source: _bmad-output/implementation-artifacts/5-3-valider-ou-refuser-une-preuve-dacompte.md] — pattern writeToOutbox après mutation avec try/catch.

### Story Completion Status

- **Status :** review
- **Completion note :** Story 5.4 implémentée : notification WhatsApp (outbox) sur delivered/cancelled dans orders.updateStatus ; tests livrée/annulée, isolation tenant, résilience writeToOutbox.

---

## Change Log

- 2026-02-08 : Implémentation 5.4 — writeToOutbox dans updateStatus pour delivered/cancelled ; templates ; try/catch ; tests unitaires (orders.test.ts).
- 2026-02-08 : Code review (CR 5-4) — 1 MEDIUM et 2 LOW corrigés (assert writeToOutbox non appelé en isolation tenant, mock reservation cohérent, en-tête tests 5.4). Statut → done.

---

## Senior Developer Review (AI)

**Date :** 2026-02-08  
**Outcome :** Approve (après corrections)

**Résumé :** AC #1 et toutes les tâches sont implémentées. Vérification des fichiers du File List (orders.ts, orders.test.ts) : writeToOutbox après transaction pour delivered/cancelled, try/catch, templates conformes, pas d’appel Twilio direct. Tests couvrent delivered, cancelled, échec writeToOutbox, isolation tenant.

**Git vs File List :** orders.ts et orders.test.ts sont des fichiers applicatifs listés ; sprint-status.yaml dans _bmad-output (hors périmètre code). Aucune divergence bloquante.

**Action Items (tous traités) :**

- [x] **[MEDIUM]** Test isolation tenant : ajouter `expect(writeToOutbox).not.toHaveBeenCalled()` pour alignement avec proofs.test (éviter régression si le flux change). → Corrigé.
- [x] **[LOW]** Mock « rejects invalid transition » : ajouter `reservation: { clientPhone }` pour cohérence avec les autres tests updateStatus. → Corrigé.
- [x] **[LOW]** En-tête orders.test.ts : mentionner Story 5.4 (notification outbox). → Corrigé.

**Notes optionnelles (non bloquantes) :** File List indique « modifié » pour orders.ts/orders.test.ts (selon le contexte git, « ajouté » peut être plus précis si ces fichiers sont nouveaux dans le dépôt). Edge case clientPhone vide : non géré explicitement ; writeToOutbox (Zod min(1)) lèverait, catch logge et la mutation réussit — acceptable pour le MVP.

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- **Story 5.4** : Dans `orders.updateStatus`, après la transaction (update + logOrderStatusChanged), si le nouveau statut est `delivered` ou `cancelled`, récupération de `clientPhone` via `order.reservation` (findFirst avec `include: { reservation: { select: { clientPhone: true } } }`). Appel à `writeToOutbox` avec templates « Ta commande SS-XXXX est livrée. » / « Ta commande SS-XXXX a été annulée. » ; try/catch + workerLogger.error en cas d’échec (mutation ne remonte pas l’erreur). Tests : delivered/cancelled → outbox appelé avec body contenant orderNumber et libellé ; échec writeToOutbox → mutation réussit ; isolation tenant (NOT_FOUND → pas d’appel outbox).

### File List

- `src/server/api/routers/orders.ts` (modifié)
- `src/server/api/routers/orders.test.ts` (modifié)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modifié)
