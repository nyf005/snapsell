# Story 4.2: Code inexistant ou typo (message clair + suggestion)

Status: done

<!-- Note: Validation optionnelle. Run validate-create-story pour contrôle qualité avant dev-story. -->

## Story

As a **cliente**,
I want **recevoir un message clair si j'envoie un code inexistant ou une typo**,
so that **je puisse corriger sans blocage**.

## Acceptance Criteria

1. **Given** j'envoie un code inexistant (ex. A12 absent de la session) ou une typo (ex. A12A)
   **When** le worker traite le message
   **Then** le bot répond « Code inconnu (ex: A12). Vérifie et renvoie. » ou parsing tolérant + suggestion (FR42)
   **And** FR42 couvert

## Tasks / Subtasks

- [x] Task 1 : Distinguer code inconnu vs épuisé (AC: #1)
  - [x] Ne pas répondre « Épuisé » pour un code inexistant ou une typo ; « Épuisé » uniquement si le code existe en session et (availableQty - reservedQty <= 0) ou item unique déjà réservé.
  - [x] Réutiliser ou introduire un lookup LiveItem par (tenant_id, live_session_id, code) sans création (pas d’appel à resolveOrCreateLiveItem pour le chemin « client + code inconnu »).

- [x] Task 2 : Réponse « Code inconnu » pour code inexistant (AC: #1)
  - [x] Quand le client envoie un message interprété comme code (format valide ex. A12) et qu’aucun LiveItem correspondant n’existe en session : répondre via outbox « Code inconnu (ex: A12). Vérifie et renvoie. » (ou template équivalent).
  - [x] Ne pas créer de LiveItem dans ce cas (comportement 4.2 : code inexistant = pas de création article unique côté client pour ce message).

- [x] Task 3 : Parsing tolérant et suggestion pour typo (AC: #1)
  - [x] Détecter les typo (ex. A12A, A12B, espaces, caractères en trop) : normalisation tolérante (ex. extraire préfixe lettre(s)+chiffres, ignorer suffixe) ou suggestion du code le plus proche en session.
  - [x] Répondre avec message clair + suggestion si possible (ex. « Code inconnu. Tu voulais dire A12 ? ») ou au minimum « Code inconnu (ex: A12). Vérifie et renvoie. ».

- [x] Task 4 : Intégration dans webhook-processor (AC: #1)
  - [x] Dans le flux client + message type code : d’abord résoudre si un LiveItem existe (lookup seul) ; si oui → flux réservation 4.1 (Réservé / File / Épuisé) ; si non (code inexistant ou typo non résolu) → outbox Code inconnu (+ suggestion si typo).
  - [x] Conserver le routage vendeur vs client ; ne traiter Code inconnu que pour messageType === "client".

- [x] Task 5 : Tests (AC: #1)
  - [x] Tests : client envoie code inexistant (A12 absent) → message « Code inconnu » ; client envoie typo (A12A) → message clair + suggestion si implémenté ; client envoie code existant → pas de régression (réservé / épuisé).
  - [x] Vérifier qu’on ne répond jamais « Épuisé » pour un code inexistant.

- **Review Follow-ups (AI)**
  - [x] [AI-Review][MEDIUM] Fichiers story (live-item) non commités : findLiveItemByCode.ts, findLiveItemByCode.test.ts, createLiveItem.ts dans répertoire untracked. À ajouter et commiter pour traçabilité.
  - [x] [AI-Review][LOW] findLiveItemByCode : ajouter test quand db.liveItem.findFirst lève une erreur.
  - [x] [AI-Review][LOW] parseClientCodeIntent : ajouter test sans mock normalizeCode (vraie normalisation).
  - [x] [AI-Review][LOW] Documenter dans findLiveItemByCode que LiveItemLookup exclut volontairement mediaStorageKey pour le flux 4.2.

## Dev Notes

- **Source :** [Source: _bmad-output/planning-artifacts/epics.md] — Epic 4, Story 4.2 ; FR42.
- **Architecture (piège explicite) :** [Source: _bmad-output/planning-artifacts/architecture.md] — « Code inconnu vs épuisé : erreur de saisie (typo, code inexistant) ≠ rupture de stock. Message clair « Code inconnu (ex: A12). Vérifie et renvoie. » ; « Épuisé » uniquement si le code existe et stock = 0 / déjà vendu. »
- **État actuel :** Le worker n’envoie « Code inconnu » pour aucun cas. Il utilise `CLIENT_CODE_PATTERN` (^[A-Za-z]+\d+$) ; si le message matche, il appelle `resolveOrCreateLiveItem` qui crée l’item s’il n’existe pas (Story 3.3). Pour 4.2 : introduire un chemin « lookup only » pour le client : si aucun LiveItem pour ce code en session → ne pas créer, répondre Code inconnu ; si typo (ex. A12A, ne matche pas le pattern strict), parsing tolérant optionnel + suggestion.
- **Périmètre :** Pas de changement au flux vendeur (création item, MODIF, etc.). Uniquement messages clients interprétés comme tentative de code (réservation).

### Project Structure Notes

- **Fichiers concernés :** `src/server/workers/webhook-processor.ts` (intent client code → lookup LiveItem, si absent ou typo → outbox Code inconnu) ; optionnel `src/server/live-item/findLiveItemByCode.ts` ou équivalent pour lookup sans création ; templates messages dans `src/server/messaging/templates.ts` ou inline.
- **Références :** [Source: _bmad-output/planning-artifacts/architecture.md] Pièges à éviter (Code inconnu vs épuisé) ; [Source: _bmad-output/planning-artifacts/epics.md] Epic 4, FR42.

---

## Developer Context (guardrails pour l'agent dev)

### Contexte métier

- **Code inexistant :** la cliente envoie un code (ex. A12) qui n’existe pas dans la session courante (aucun LiveItem avec ce code). Le bot doit répondre un message clair avec exemple, sans créer d’item (ne pas réutiliser le flux 3.3 create-on-send pour ce cas dans 4.2).
- **Typo :** ex. A12A, B7x, espaces ou caractères en trop. Le bot doit soit (1) parsing tolérant (extraire A12 et proposer « Tu voulais dire A12 ? » si A12 existe en session), soit (2) au minimum le même message « Code inconnu (ex: A12). Vérifie et renvoie. ».
- **Épuisé :** réservé au cas où le code existe en session mais stock = 0 ou plus de place (availableQty - reservedQty <= 0, ou item unique déjà réservé). Ne jamais répondre « Épuisé » pour un code inexistant ou une typo non résolue.

### Technical Requirements

- **Lookup sans création :** pour le flux client + message « code », d’abord trouver un LiveItem existant pour (tenantId, liveSessionId, code_normalisé). Si aucun → ne pas appeler `resolveOrCreateLiveItem` ; répondre Code inconnu. Si trouvé → flux actuel (réservation / file / épuisé).
- **Normalisation code :** réutiliser la même normalisation que le reste du projet (trim, uppercase pour lookup) ; pour typo, optionnel : extraire sous-chaîne matchant [A-Za-z]+\d+ (longest match depuis le début) et chercher un LiveItem avec ce code ou un code « proche » (ex. codes en session pour suggestion).
- **Messages :** texte FR dans outbox ; centraliser si un module templates existe, sinon inline. Exemples : « Code inconnu (ex: A12). Vérifie et renvoie. », « Code inconnu. Tu voulais dire A12 ? ».

### Architecture Compliance

- **Stack :** inchangé (Prisma, workers, outbox, event_log). Pas de nouveau modèle ; uniquement logique de parsing et réponses.
- **Idempotence :** pas de nouvelle clé ; le message « Code inconnu » peut être envoyé plusieurs fois pour le même code manquant (pas d’effet de bord persistant).
- **Routage :** uniquement pour `messageType === "client"` ; vendeur inchangé.

### Library / Framework Requirements

- Aucune nouvelle dépendance. Réutiliser Prisma pour lookup LiveItem, `writeToOutbox` pour la réponse.

### File Structure Requirements

- **Worker :** `src/server/workers/webhook-processor.ts` — dans le bloc client + message type code : remplacer ou compléter l’appel à `resolveOrCreateLiveItem` par : (1) normaliser le body en code candidat ; (2) lookup LiveItem (tenantId, liveSessionId, code) ; (3) si trouvé → flux réservation actuel ; si non trouvé (et optionnellement si typo) → tentative suggestion puis outbox « Code inconnu » (+ suggestion si applicable).
- **Optionnel :** `src/server/live-item/findLiveItemByCode.ts` (findLiveItemByCode(tenantId, liveSessionId, code) → LiveItem | null) pour garder le processor lisible.
- **Templates :** réutiliser ou ajouter clés pour code_unknown, code_unknown_suggestion dans templates si existant.

### Testing Requirements

- Test : client envoie code valide (A12) mais aucun LiveItem A12 en session → réponse « Code inconnu » (ou équivalent), pas de création LiveItem.
- Test : client envoie typo (A12A) → réponse claire (avec ou sans suggestion selon implémentation).
- Test : client envoie code existant (A12 en session, dispo) → pas de régression : « Réservé. Envoie ton adresse. ».
- Test : ne jamais répondre « Épuisé » quand le code n’existe pas en session.

### Previous Story Intelligence (Story 4.1)

- **Story 4.1 :** Réservation (code → Réservé / Épuisé), collecte adresse, récap + OUI. Le flux client « code » appelle actuellement `resolveOrCreateLiveItem` puis `createReservation` ou « Épuisé ». Pour 4.2, insérer avant : lookup LiveItem ; si absent → « Code inconnu » et ne pas créer.
- **CLIENT_CODE_PATTERN :** `/^[A-Za-z]+\d+$/` — A12A ne matche pas. Pour typo, soit élargir la détection (regex ou parse tolérant), soit traiter tout message client non-vide non-adresse comme candidat code et faire une normalisation « typo » (strip trailing letters, etc.) avant lookup.
- **resolveOrCreateLiveItem :** utilisé aujourd’hui pour tout message client qui matche le pattern ; pour 4.2, utiliser un « find only » dans le chemin client pour éviter création quand on veut répondre Code inconnu.

### Git Intelligence Summary

- Fichiers récents : `src/server/workers/webhook-processor.ts`, `src/server/live-item/createLiveItem.ts`, `src/server/reservation/service.ts`. Garder les mêmes patterns : correlationId, writeToOutbox, isolation tenant, pas de logique lourde dans la route webhook.

### Latest Tech Information

- Aucune mise à jour de librairie requise. Stack T3, Prisma, BullMQ inchangés.

### Project Context Reference

- Pipeline webhook < 1 s ; métier dans workers ; outbox pour tout envoi ; event_log avec correlationId. [Source: _bmad-output/planning-artifacts/architecture.md] Pièges (Code inconnu vs épuisé).

### Story Completion Status

- **Status :** ready-for-dev
- **Completion note :** Contexte story 4.2 complété — code inexistant et typo : message clair + suggestion, sans répondre « Épuisé », prêt pour implémentation par l’agent Dev.

---

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Story 4.2 implémentée : flux client « code » utilise un lookup seul (findLiveItemByCode) au lieu de resolveOrCreateLiveItem. Si aucun LiveItem → outbox « Code inconnu (ex: X). Vérifie et renvoie. » ; si typo (ex. A12A) et code extrait (A12) existe en session → « Code inconnu. Tu voulais dire A12 ? » ; sinon flux 4.1 (Réservé / Épuisé). « Épuisé » uniquement quand le code existe et (availableQty - reservedQty <= 0).
- Tests : findLiveItemByCode.test.ts (4), parseClientCodeIntent + processWebhookJob 4.2 dans webhook-processor.test.ts (51 au total, dont 5 nouveaux pour 4.2). Suite complète 209 passent.
- Code review (CR 4-2) : 1 MEDIUM, 3 LOW. Corrections appliquées : (1) git add des fichiers 4-2 (findLiveItemByCode.ts, findLiveItemByCode.test.ts, createLiveItem.ts, webhook-processor*.ts) — à commiter ; (2) test findLiveItemByCode quand findFirst lève ; (3) test parseClientCodeIntent avec vraie normalisation ; (4) JSDoc LiveItemLookup exclut mediaStorageKey. Tous les follow-ups cochés [x].

### File List

- src/server/live-item/findLiveItemByCode.ts (new)
- src/server/live-item/findLiveItemByCode.test.ts (new)
- src/server/live-item/createLiveItem.ts (messageCodeUnknown, messageCodeUnknownSuggestion)
- src/server/workers/webhook-processor.ts (parseClientCodeIntent, findLiveItemByCode, flux client code 4.2)
- src/server/workers/webhook-processor.test.ts (mock findLiveItemByCode, parseClientCodeIntent tests, Story 4.2 tests)
- _bmad-output/implementation-artifacts/sprint-status.yaml (4-2 → in-progress puis review)
- _bmad-output/implementation-artifacts/4-2-code-inexistant-ou-typo-message-clair-suggestion.md (tasks, status, Dev Agent Record)

---

## Senior Developer Review (AI)

**Date:** 2026-02-08  
**Story:** 4-2-code-inexistant-ou-typo-message-clair-suggestion  
**Outcome:** Changes Requested

### Git vs Story Discrepancies

- **1 discrepancy:** Le répertoire `src/server/live-item/` est entièrement **untracked** (??). Les fichiers de la story (findLiveItemByCode.ts, findLiveItemByCode.test.ts, createLiveItem.ts) ne sont pas commités. Seuls `webhook-processor.ts` et `webhook-processor.test.ts` apparaissent en modifiés (M) dans git.

### Validation AC / Tasks

- **AC #1** : Implémenté — code inexistant → « Code inconnu (ex: A12). Vérifie et renvoie. » ; typo avec suggestion si code extrait en session ; jamais « Épuisé » pour code absent.
- **Toutes les tâches [x]** : Vérifiées dans le code (lookup seul, messages, parsing typo, intégration worker, tests).

### Action Items

| # | Severity | Description | File:line / ref |
|---|----------|-------------|-----------------|
| 1 | MEDIUM | Fichiers story (live-item) non commités : findLiveItemByCode.ts, findLiveItemByCode.test.ts, createLiveItem.ts sont dans un répertoire untracked. À ajouter et commiter pour traçabilité. | git status |
| 2 | LOW | findLiveItemByCode : pas de test quand `db.liveItem.findFirst` lève une erreur (ex. timeout). Le worker a un try/catch global ; un test unitaire d’erreur DB améliorerait la robustesse. | findLiveItemByCode.test.ts |
| 3 | LOW | parseClientCodeIntent : les tests mockent normalizeCode ; un test sans mock (vraie normalisation createLiveItem) réduirait le risque de régression si normalizeCode change. | webhook-processor.test.ts |
| 4 | LOW | LiveItemLookup n’inclut pas mediaStorageKey ; documenter que c’est volontaire pour le flux 4.2 (pas d’usage dans réservation). | findLiveItemByCode.ts:9-17 |

**Résolution (2026-02-08) :** Tous les points traités. MEDIUM : fichiers 4-2 ajoutés au staging (git add) ; LOW : test findFirst throw, test parseClientCodeIntent avec vraie normalisation, JSDoc LiveItemLookup. Suites de tests passantes.

### Review 2 (Re-check) — 2026-02-08

**Outcome:** Approve

- **Git :** Fichiers 4-2 commités (commit « Story 4-2: code inconnu/typo, review follow-ups »). Plus d’écart avec la File List.
- **AC #1 :** Confirmé implémenté (code inconnu, typo + suggestion, jamais « Épuisé » pour code absent).
- **Tâches et follow-ups :** Tous [x]. Aucun nouveau point.
- **Tests :** 57 passent (findLiveItemByCode 5, webhook-processor 52).
