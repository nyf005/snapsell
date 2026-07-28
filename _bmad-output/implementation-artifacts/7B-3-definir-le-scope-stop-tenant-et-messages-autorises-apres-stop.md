# Story 7B.3: Définir le scope STOP (tenant) et messages autorisés après STOP

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

En tant que **produit / ops**,  
je veux **définir explicitement le scope opt-out STOP (tenant) et quels messages restent autorisés après STOP**,  
afin que **la politique soit claire (transactionnels stricts vs aucun)**.

## Acceptance Criteria

1. **Scope STOP explicite (tenant)**
   - **Given** la documentation produit ou la config tenant,  
     **When** un client a envoyé STOP sur le numéro du tenant,  
     **Then** le scope opt-out est documenté comme **tenant** : (tenant_id, phone_number) identifie un opt-out ; un même numéro ayant envoyé STOP à un autre tenant n'est pas considéré opt-out pour ce tenant.
2. **Politique « messages autorisés après STOP »**
   - **Given** un client a opt-out (STOP) pour un tenant,  
     **When** le système prépare un message sortant vers ce numéro,  
     **Then** la règle produit configurée est appliquée : soit **aucun message** (comportement actuel MVP), soit **uniquement messages transactionnels stricts** si la politique du tenant le permet (FR46).
3. **Définition des messages transactionnels (si politique = transactionnels stricts)**
   - **Given** la politique tenant = « transactionnels stricts autorisés après STOP »,  
     **When** un message sortant est émis (outbox),  
     **Then** seuls les messages explicitement marqués comme transactionnels stricts (ex. rappel de confirmation de commande, notification de livraison, alerte sécurité) sont envoyés ; les messages marketing ou de rappel promotionnel restent bloqués.
4. **Config ou documentation**
   - **Given** l'équipe produit a choisi la règle (aucun vs transactionnels stricts),  
     **When** l'implémentation est livrée,  
     **Then** la règle est soit **documentée** (si MVP = tous bloqués), soit **configurable par tenant** (ex. champ `allow_transactional_after_stop` ou équivalent) avec valeur par défaut sûre (bloquer tout).

## Tasks / Subtasks

- [x] **Clarifier la règle produit (documentation)**
  - [x] Documenter dans le repo (ou docs produit) : scope STOP = tenant ; politique par défaut MVP = aucun message après STOP.
  - [x] Si produit exige « transactionnels stricts » : documenter la liste des types de messages considérés transactionnels stricts (ex. order_status, delivery_notification, security_alert).
- [x] **Backend – Politique « aucun message » (déjà en place)**
  - [x] Vérifier que le flux actuel (outbox-sender → checkOptOut → blocage) reste le comportement par défaut et qu'il est clairement commenté comme « politique : aucun message après STOP » (FR46).
- [x] **Backend – Option « transactionnels stricts » (si demandé)** — N/A : Option A (MVP) choisie, politique = aucun message après STOP. Les sous-tâches ci-dessous ne s'appliquent pas en MVP ; documentées dans `docs/stop-policy.md` §3 pour évolution future.
  - [ ] ~~Si config tenant `allow_transactional_after_stop` : logique outbox-sender~~ — reporté (Option A MVP)
  - [ ] ~~Étendre le schéma/payload outbox pour `message_category`~~ — reporté (Option A MVP)
- [x] **Cohérence avec 7B.1 / 7B.2**
  - [x] Aucune modification des écrans ops (logs, file d'erreurs) requise pour cette story ; les événements `message_blocked_optout` restent inchangés.
- [x] **Tests**
  - [x] Conserver les tests existants (optout, outbox-sender block when OptOut) ; ajouter tests si nouvelle politique transactionnels stricts (envoyer si transactionnel + config true, bloquer si non transactionnel ou config false).

## Dev Notes

- **Contexte actuel (Story 2.5 + 7B.2)**
  - **STOP** : détection dans `webhook-processor` (`isStopMessage`, `STOP_KEYWORDS`) ; création **OptOut** (tenant_id, phone_number) ; idempotence sur (tenant_id, phone_number). Table `opt_outs`, contrainte unique (tenant_id, phone_number).
  - **Envoi** : `outbox-sender` appelle `checkOptOut(tenantId, to)` avant envoi ; si opt-out → statut `blocked`, log `message_blocked_optout`, pas d'envoi Twilio. Aujourd'hui **tous** les messages sont bloqués après STOP (commentaire dans le code : « à définir en FR46/7B.3 »).
- **Objectif 7B.3**
  - Rendre la **politique explicite** (documentation + commentaires) et, si le produit le souhaite, permettre une **option par tenant** : autoriser uniquement les messages « transactionnels stricts » après STOP.
- **Architecture (architecture.md §7, §7.1)**
  - « STOP : politique explicite par tenant (scope = tenant) ; après STOP, seuls les messages transactionnels stricts autorisés ou aucun, selon règle produit (FR46). » Pas de changement d'interface MessagingProvider ; la décision bloquer/autoriser reste côté outbox-sender après lecture OptOut (et éventuelle config tenant).
- **Choix d'implémentation recommandé (MVP)**
  - **Option A (minimal)** : documenter que la politique est « aucun message après STOP » ; renforcer commentaires dans `outbox-sender.ts` et `optout.ts` pour indiquer FR46/7B.3 et scope tenant. Aucun nouveau champ DB.
  - **Option B (config + transactionnels)** : ajouter sur Tenant un champ (ex. `allowTransactionalAfterStop`, booléen, défaut false). Dans outbox-sender : si OptOut et `allowTransactionalAfterStop === true`, vérifier un champ sur MessageOut (ex. `messageCategory: 'transactional'`) ; n'envoyer que si transactionnel. Définir une liste fermée de catégories considérées « transactionnels stricts » (ex. order_status, delivery_notification).
- **Fichiers concernés**
  - `src/server/workers/outbox-sender.ts` (logique blocage / exception transactionnelle).
  - `src/server/messaging/optout.ts` (aucun changement requis sauf si on ajoute un paramètre « allowTransactional » pour centraliser la logique).
  - Prisma : `Tenant` (optionnel, si Option B) ; `MessageOut` ou payload job (optionnel, si tag message_category).
  - Docs : README ou `docs/` pour politique STOP et scope tenant.

### Project Structure Notes

- **Backend** : pas de nouveau router ; évolution de `outbox-sender.ts` et éventuellement schéma Prisma (Tenant, MessageOut). Réutiliser `checkOptOut` et `logMessageBlockedOptOut` (eventLog).
- **Frontend** : aucune page dédiée requise pour cette story ; si Option B avec config par tenant, un champ dans la page paramètres tenant (dashboard) peut être ajouté (story ou scope léger selon décision produit).
- **Cohérence** : même pattern que 2.5 (OptOut) et 7B.2 (logs/events inchangés).

### References

- Source fonctionnelle : `epics.md` – **Epic 7B : Ops console (logs, erreurs, DLQ, STOP)**, story **7B.3** ; **FR46**.
- Architecture : `architecture.md` §7 (STOP, politique par tenant), §7.1 (messaging provider-agnostic).
- Code existant : `src/server/workers/outbox-sender.ts` (l.74–97), `src/server/messaging/optout.ts`, `src/server/workers/webhook-processor.ts` (STOP → OptOut), `src/server/events/eventLog.ts` (`logMessageBlockedOptOut`, `logOptOutRecorded`).
- Story précédente : `7B-2-consulter-la-file-derreurs-dlq-media-envoi-echoue.md` (opsProcedure, layout (ops), DLQ ; pas de changement des écrans pour 7B.3).

## Senior Developer Review (AI)

**Reviewed:** 2026-02-10
**Outcome:** Changes Requested
**Issues:** 1 High, 3 Medium, 2 Low

### Action Items

- [x] [H1] Task 3 sous-tâches marquées [x] alors que non implémentées (Option A) — corrigé : sous-tâches marquées [ ] avec mention « reporté (Option A MVP) »
- [x] [M1] `webhook-processor.ts` commentaire STOP_KEYWORDS ne référence pas 7B.3 — corrigé : ajout référence 7B.3/FR46
- [x] [M2] `docs/stop-policy.md` silencieux sur UNSTOP / opt-back-in — corrigé : section §5 ajoutée
- [x] [M3] Dev Agent Record `{{agent_model_name_version}}` placeholder — corrigé
- [x] [L1] `docs/stop-policy.md` pas de mention idempotence — corrigé : ajout dans §1
- [x] [L2] `docs/stop-policy.md` chemins fichiers manquants — corrigé : ajout dans §1 et §2

## Dev Agent Record

### Agent Model Used

Claude claude-4.6-opus (Cursor)

### Debug Log References

### Completion Notes List

- Option A (MVP) : documentation + commentaires explicites. Pas de nouveau champ DB.
- Task 1 : `docs/stop-policy.md` — scope STOP = tenant, politique MVP = aucun message après STOP, liste types transactionnels stricts (order_status, delivery_notification, security_alert) pour référence future.
- Task 2 : Commentaires FR46/7B.3 dans `outbox-sender.ts` et `optout.ts` (politique « aucun message après STOP », lien docs/stop-policy.md).
- Task 3 : Option « transactionnels stricts » documentée uniquement (config par tenant non implémentée en MVP). Sous-tâches marquées reportées.
- Task 4 : Aucune modification des écrans ops.
- Task 5 : Tests existants conservés (optout, outbox-sender) ; 449 tests passent.
- Code Review (AI) : 6 issues corrigées (H1, M1-M3, L1-L2). Commentaire webhook-processor mis à jour, doc UNSTOP + idempotence + chemins fichiers ajoutés, placeholder agent corrigé.

### File List

**Nouveaux fichiers:**
- `docs/stop-policy.md`

**Fichiers modifiés:**
- `src/server/workers/outbox-sender.ts` — Commentaires politique STOP (FR46, 7B.3)
- `src/server/messaging/optout.ts` — Commentaires scope tenant et docs/stop-policy.md
- `src/server/workers/webhook-processor.ts` — Commentaire STOP_KEYWORDS référence 7B.3/FR46

### Change Log

- 2026-02-10: Story 7B.3 — Documentation STOP (docs/stop-policy.md), commentaires outbox-sender + optout. Politique MVP = aucun message après STOP. Option transactionnels stricts documentée pour évolution future.
- 2026-02-10: Code Review (AI) — 6 issues corrigées : H1 (Task 3 sous-tâches [x] → reportées), M1 (webhook-processor ref 7B.3), M2 (doc UNSTOP), M3 (placeholder agent), L1 (idempotence), L2 (chemins fichiers).
