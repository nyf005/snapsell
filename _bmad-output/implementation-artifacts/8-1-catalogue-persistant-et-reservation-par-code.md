# Story 8.1: Catalogue persistant et réservation par code (tenant, code)

Status: done

<!-- Référence état des lieux : voir résumé ci-dessous (éviter duplication avec code existant). -->

## Modèle métier (vision)

L'**étiquette** (ex. A12) collée sur l'article en est le **code persistant** : ce n'est pas un code « de session ». En live, le vendeur présente des articles qui ont (ou reçoivent) ce code ; si un article n'est pas acheté, il garde son étiquette et reste **dans le catalogue** avec le même code. Que la cliente ait suivi le live ou non, si plus tard elle voit « pour commander envoyez le code X sur WhatsApp », l'article est toujours disponible avec ce code. **Une seule source de vérité : le catalogue.** Le live est un moment de présentation, pas un stock séparé.

## Story

As a **cliente**,
I want **envoyer un code sur WhatsApp à tout moment (en live ou pas)**,
so that **le bot réserve l'article s'il est dans le catalogue du vendeur (même code que sur l'étiquette), sans que le vendeur ait besoin d'être en live**.

## Ce que cette story corrige

- **Aujourd’hui :** La réservation dépend d’une **session live** : le bot cherche l’article dans la session courante (`findLiveItemByCode`). Pas de session ou session fermée → « Code inconnu », même si le vendeur a le même article en stock. Pas de catalogue persistant : on ne peut pas commander hors live.
- **Après :** La réservation se fait sur le **catalogue** (tenant + code), sans dépendre du live. Une cliente peut envoyer un code à tout moment ; en live, si le code n’existe pas encore (vendeur a juste collé l’étiquette), on crée l’article à la volée puis on réserve. Hors live, code absent → « Code inconnu » (pas de création).
- **Stories qu'on fait évoluer :** **2.6** (plus de getOrCreateCurrentSession pour l'intent client « code »), **3.3** (resolveOrCreateLiveItem en session → findOrCreateOrderableItemByCode sur catalogue, uniquement si session active), **4.1** (réservation sur LiveItem → réservation sur CatalogueItem), **4.2** (code inconnu : en live création à la volée, hors live message inchangé).

## Contexte / État des lieux (avant implémentation)

- **Existant :** `findLiveItemByCode(tenantId, liveSessionId, code)` — lookup uniquement dans une session donnée. Webhook : `getOrCreateCurrentSession(tenantId)` puis `findLiveItemByCode(tenantId, liveSessionId, code)`. Si la dernière session est fermée, une nouvelle session vide est créée → codes introuvables.
- **Existant :** `createReservation(tenantId, liveSessionId, liveItemId, clientPhone, correlationId)` — réservation liée à une session et un `LiveItem`. Modèle `Reservation` : `liveSessionId`, `liveItemId` requis. `reserveOneUnit(tenantId, liveItemId)` travaille sur `live_items`.
- **Existant :** Pas de table catalogue. `LiveItem` : unicité `(tenantId, liveSessionId, code)`.
- **Objectif :** Un seul flux de réservation piloté par (tenant, code) sur le **catalogue** ; pas de notion de session pour la disponibilité de l'article. Réutiliser au maximum : `createReservation`, `reserveOneUnit`, outbox, event log ; **ne pas dupliquer** la logique réservation / file / épuisé.

## Acceptance Criteria

1. **Given** un code présent dans le catalogue du tenant (code = étiquette de l'article)  
   **When** une cliente envoie ce code sur WhatsApp  
   **Then** le bot répond comme aujourd'hui (Réservé / File #N / Épuisé) et une réservation est créée  
   **And** le flux ne dépend pas du live : la recherche se fait uniquement dans le catalogue par (tenant, code)

2. **Given** un code **absent du catalogue** mais valide (ex. A12) **et une session live active** (vendeur a lancé le live, voir story 8.3)  
   **When** la cliente envoie ce code  
   **Then** le système **crée** l'article dans le catalogue (quantité 1, prix dérivé de la lettre via la grille) puis traite la réservation (Réservé / File / Épuisé). La lettre détermine le prix donc on peut facturer. En live le vendeur colle les étiquettes sans tout taper ; la première commande crée l'article.  
   **And** aucune session n'est créée pour ce message (on utilise getCurrentSessionReadOnly pour savoir si on est en live).

2b. **Given** un code **absent du catalogue** (valide ou non) **et aucune session live active**  
   **When** la cliente envoie ce code  
   **Then** le bot répond « Code inconnu » (FR42) — on ne crée pas d'article à la volée hors live (catalogue uniquement en lookup).

2c. **Given** un code **invalide** (lettre non configurée dans la grille, ou code vide après normalisation)  
   **When** la cliente envoie ce code  
   **Then** le bot répond « Code inconnu » (FR42) — on ne crée pas d'article sans prix.

3. **Given** une réservation créée à partir du catalogue (sans session active)  
   **When** la cliente envoie son adresse puis OUI  
   **Then** la commande est créée comme aujourd'hui (Order → Reservation)  
   **And** le vendeur voit la commande dans la liste des commandes du dashboard (existant : `orders.list`)

4. **Given** le modèle de données catalogue (voir Tasks)  
   **When** le webhook traite un message client « code »  
   **Then** la résolution de l'item se fait via un lookup unique par (tenantId, code) sur le **catalogue** (seule source)  
   **And** la création de réservation et le décrément de stock portent sur l'item catalogue

5. **Given** une commande vient d'être confirmée (OUI) pour un article catalogue avec `createdInLive === true` et sa quantité disponible est passée à 0  
   **When** le flux de confirmation s'exécute  
   **Then** le code est libéré (entrée catalogue supprimée ou marquée released) pour permettre un nouvel upsert avec ce code  
   **And** les Order/Reservation existantes conservent les infos item (historique inchangé). Les articles avec `createdInLive === false` ne libèrent jamais le code à la vente.

## Tasks / Subtasks

- [x] Task 1 : Modèle de données catalogue (AC: #1, #4)
  - [x] Introduire la **table `CatalogueItem`** (tenant_id, code unique, quantity, availableQty, reservedQty, amountCents, mediaStorageKey, **createdInLive** bool, etc.) comme **seule** source d'articles commandables. Contrainte unique `(tenantId, code)` — le code = étiquette persistante de l'article. `createdInLive = true` pour les articles créés en live (vendeur en session ou création à la volée client) ; `false` pour les articles créés offline (dashboard, ou promotion fin de session sans origine live).
  - [x] Adapter `Reservation` pour référencer l'item catalogue (catalogueItemId) ; liveSessionId optionnel (pour traçabilité « réservation pendant ce live »). Adapter `createReservation` et `reserveOneUnit` pour travailler sur CatalogueItem.

- [x] Task 2 : Résolution ou création par (tenant, code) sur le catalogue (AC: #1, #2, #2b, #4)
  - [x] Créer `findOrderableItemByCode(tenantId, code)` : lookup dans le catalogue (CatalogueItem par tenant_id, code). Retourner null si absent ou code invalide (normalizeCode vide).
  - [x] Créer **`findOrCreateOrderableItemByCode(tenantId, code)`** pour le flux client : (1) normaliser le code ; (2) si invalide (vide ou lettre sans prix) → null ; (3) chercher dans le catalogue ; (4) si absent → **créer** CatalogueItem (tenant_id, code, quantity 1, availableQty 1, reservedQty 0, amountCents via `getPriceFromCode(tenantId, code)` — la lettre détermine le prix donc on peut facturer sans que le vendeur ait pré-créé l'article) ; (5) retourner l'item (existant ou créé). Réutiliser `normalizeCode`, `getPriceFromCode`. En cas de doublon (race), réessayer le lookup.

- [x] Task 3 : Webhook — réservation sur le catalogue (AC: #1, #2, #2b, #2c, #4)
  - [x] Dans `webhook-processor.ts`, pour l'intent client « code » : ne plus appeler `getOrCreateCurrentSession`. Appeler **`getCurrentSessionReadOnly(tenantId)`** pour savoir si on est en live.
  - [x] **Si session active** (non null) : utiliser **`findOrCreateOrderableItemByCode(tenantId, code)`** — création à la volée si code absent. Si item obtenu → réservation sur l'item catalogue ; si null (code invalide) → « Code inconnu ».
  - [x] **Si pas de session active** (null) : utiliser **`findOrderableItemByCode(tenantId, code)`** uniquement. Si trouvé → réservation ; si non trouvé → « Code inconnu » (pas de création hors live).
  - [x] Conserver les messages et la logique existants : Réservé, File #N, Épuisé, idempotence, collecte adresse, OUI → commande.

- [x] Task 4 : Réservation et stock sur CatalogueItem (AC: #1, #3)
  - [x] `createReservation` et `reserveOneUnit` travaillent sur CatalogueItem (catalogueItemId). Même sémantique concurrence (transaction, SELECT FOR UPDATE). Flux confirmation (OUI) et Order inchangé ; affichage commandes dashboard adapté pour Reservation → catalogueItem.
  - [x] **Réservation (service)** : adapter `getActiveReservationForClient`, `collectAddress`, `confirmReservation` pour prendre en compte les réservations avec `liveSessionId` null (réservations catalogue) — les where/select ne doivent pas exclure ces réservations.
  - [x] **Order** : `createOrderFromReservation` et router `orders.ts` doivent utiliser `reservation.catalogueItem` (code, amountCents, etc.) quand `catalogueItemId` est présent, à la place de `reservation.liveItem`.
  - [x] **Libération du code après vente (articles créés en live)** : Lors de la confirmation de commande (OUI → `createOrderFromReservation`), après décrément du stock sur le CatalogueItem, si `catalogueItem.createdInLive === true` et `availableQty === 0`, libérer le code (supprimer l'entrée CatalogueItem pour ce (tenantId, code) ou marquer « released » et exclure du lookup). Ne pas libérer pour les articles créés offline. L'historique Order/Reservation reste intact.

- [x] Task 5 : Live Ops, Waitlist et TTL (alignement inventaire §2 et §4)
  - [x] **Live Ops** (`src/server/api/routers/live.ts`) : adapter `getLiveOpsData` / `getSessionItems` pour afficher les items commandables (catalogue filtré par « session en cours » si lien conservé, ou sous-ensemble catalogue). `releaseReservation` doit fonctionner sur l’item catalogue lié à la réservation (réservation.catalogueItemId → release sur CatalogueItem).
  - [x] **Waitlist** : faire évoluer le schéma et `addToWaitlist` vers `catalogueItemId` (ou conserver `liveSessionId` pour traçabilité selon choix). Idempotence et promotion waitlist cohérentes avec réservation sur catalogue.
  - [x] **reservation-ttl** (`src/server/workers/reservation-ttl.ts`) : lors de la promotion du premier en file, appeler `createReservation` avec `catalogueItemId` (et `liveSessionId` optionnel). Adapter la lecture des réservations expirées / waitlist si le modèle change.

- [x] Task 6 : Tests (AC: #1–#5, #2, #2b, #2c)
  - [x] Tests `findOrderableItemByCode` : lookup catalogue, code absent → null, normalisation code.
  - [x] Tests `findOrCreateOrderableItemByCode` : code absent → création (qty 1, prix grille, createdInLive selon contexte) ; code invalide → null ; code existant → retour sans créer.
  - [x] Tests webhook : **avec session active** : code présent → Réservé ; code absent → item créé puis Réservé ; code invalide → Code inconnu. **Sans session active** : code présent → Réservé ; code absent → Code inconnu (pas de création).
  - [x] Tests réservation + confirmation : réservation catalogue (item créé à la volée ou préexistant) → adresse → OUI → Order créée.
  - [x] Tests libération du code (AC #5) : commande confirmée pour item `createdInLive` avec qty → 0 → code libéré (lookup retourne null ou item exclu) ; item `createdInLive === false` vendu → code non libéré.
  - [x] Adapter `reservation-ttl.test.ts` et tests waitlist si besoin.

## Dev Notes

- **Source :** Epic 8, Story 8.1 ; vision Product Brief (catalogue, ventes hors live). État des lieux détaillé en début de document.
- **Ne pas dupliquer :** `createReservation`, `reserveOneUnit`, `releaseReservation`, messages outbox, event log, flux adresse/OUI. Étendre ou paramétrer pour supporter l'item catalogue.
- **Ordre d'implémentation suggéré :** Task 1 (modèle) → Task 2 (lookup) → Task 4 (réservation + order + reservation service) → Task 3 (webhook) → Task 5 (Live Ops, waitlist, TTL) → Task 6 (tests). Story 8.2 alimentera le catalogue ; en 8.1 on peut supposer des CatalogueItems créés manuellement ou par un seed pour les tests.
- **Event log :** Les payloads existants (live_session_id, live_item_id) peuvent être complétés par `catalogue_item_id` où pertinent (logReservationStarted, etc.) — optionnel, pour traçabilité.
- **Catalogue = seule source :** Le code (étiquette) est l'identifiant persistant de l'article. **Création à la volée uniquement en live** : si une session live est active (`getCurrentSessionReadOnly(tenantId) !== null`), et que le code n'existe pas dans le catalogue, on crée l'article (qty 1, prix grille) puis on réserve. Hors live : lookup catalogue seul ; code absent → « Code inconnu ». La session est démarrée explicitement par le vendeur (bouton « Lancer le live », story 8.3).

- **Libération des codes (live vs offline) — règle produit :**
  - **Quand :** Dès que le produit est vendu (commande confirmée, OUI), que la vente ait eu lieu pendant le live ou plus tard. Un article présenté en live garde son code tant qu’il n’est pas vendu ; une fois vendu, on libère le code (uniquement pour les articles « créés en live »).
  - **Scope :** Uniquement les **articles créés en live** : (1) créés par le vendeur pendant un live (WhatsApp ou session active), ou (2) créés à la volée par une commande client (`findOrCreateOrderableItemByCode`). Un article **offline** peut être présenté en live sans avoir été créé en live ; dans ce cas on ne libère pas le code après vente (stock maîtrisé, même code = même référence).
  - **Comportement :** Libération = le code redevient disponible pour un nouvel upsert (suppression de l’entrée catalogue pour ce code, ou marquage « released » et exclusion du lookup). L’historique des commandes n’est pas effacé : Order / Reservation conservent les infos item (code, amountCents, etc.).
  - **Implémentation :** Le modèle `CatalogueItem` doit distinguer l’origine : champ `createdInLive` (boolean) ou équivalent. Lors de la confirmation de commande (`createOrderFromReservation` ou flux OUI), si l’item catalogue était `createdInLive` et sa quantité disponible passe à 0, appeler une logique de libération du code (supprimer l’entrée ou marquer released). Voir tâche dédiée ci‑dessous.

### Fichiers concernés (existant à étendre)

- `generated/prisma/schema.prisma` — modèle CatalogueItem, Reservation.catalogueItemId (liveSessionId optionnel), éventuellement Waitlist.catalogueItemId.
- `src/server/catalogue/findOrderableItemByCode.ts` (nouveau) — lookup (tenantId, code) sur catalogue.
- `src/server/catalogue/findOrCreateOrderableItemByCode.ts` (nouveau) — pour le flux client : find + si absent création (qty 1, prix grille) ; utilise getPriceFromCode, normalizeCode.
- `src/server/workers/webhook-processor.ts` — intent client code : findOrCreateOrderableItemByCode (création à la volée si code absent), pas getOrCreateCurrentSession ; createReservation avec catalogueItemId.
- `src/server/reservation/service.ts` — createReservation, getActiveReservationForClient, collectAddress, confirmReservation avec support catalogue (liveSessionId optionnel).
- `src/server/live-item/reservation.ts` — reserveOneUnit / releaseReservation / confirmReservation sur CatalogueItem.
- `src/server/order/createOrderFromReservation.ts` — utiliser reservation.catalogueItem si catalogueItemId présent.
- `src/server/api/routers/orders.ts` — affichage reservation.catalogueItem?.code (ou liveItem selon schéma).
- `src/server/api/routers/live.ts` — getLiveOpsData / getSessionItems (items catalogue ou filtrés) ; releaseReservation sur item catalogue.
- `src/server/waitlist/addToWaitlist.ts` — évoluer vers catalogueItemId si besoin.
- `src/server/workers/reservation-ttl.ts` — createReservation avec catalogueItemId lors de la promotion waitlist.

---

## Inventaire : tout le code lié à la session à ajuster (pour implémentation catalogue)

Pour que le passage au catalogue soit correct, **tout** le code ci‑dessous doit être revu/ajusté. Les stories 8.1 et 8.2 couvrent ces points ; cette liste sert de checklist.

### 1. Webhook & réservation client (flux « client envoie code »)

| Fichier | Rôle actuel | Ajustement |
|---------|-------------|------------|
| `src/server/workers/webhook-processor.ts` | getOrCreateCurrentSession → liveSessionId ; findLiveItemByCode(tenantId, liveSessionId, code) ; createReservation(..., liveSessionId, liveItemId, ...) ; collecte adresse / OUI avec liveSessionId | Ne plus appeler getOrCreateCurrentSession pour l’intent « code » ; **getCurrentSessionReadOnly**(tenantId). Si session active → findOrCreateOrderableItemByCode (création à la volée si absent). Si pas de session → findOrderableItemByCode seul ; absent → Code inconnu. createReservation avec catalogueItemId. (Session démarrée par bouton, story 8.3.) |
| `src/server/live-item/findLiveItemByCode.ts` | Lookup (tenantId, liveSessionId, code) sur LiveItem | Garder pour affichage Live Ops si on garde des items « de session » ; sinon ou en plus : findOrderableItemByCode sur catalogue. |
| `src/server/reservation/service.ts` | createReservation(tenantId, **liveSessionId**, liveItemId, ...) ; idempotence (tenant, **liveSessionId**, client, liveItemId) ; reserveOneUnit(tenantId, liveItemId) | Accepter catalogueItemId (et liveSessionId optionnel). Idempotence sur (tenant, client, catalogueItemId). reserveOneUnit sur CatalogueItem (ou adapter pour accepter catalogueItemId). |
| `src/server/live-item/reservation.ts` | reserveOneUnit(tenantId, liveItemId) sur `live_items` ; releaseReservation idem ; confirmReservation sur live_item | Étendre pour CatalogueItem (même table ou nouvelle : SELECT FOR UPDATE sur catalogue_items). |

### 2. Live Ops (dashboard « session en cours »)

| Fichier | Rôle actuel | Ajustement |
|---------|-------------|------------|
| `src/server/api/routers/live.ts` | getCurrentSessionReadOnly ; items = LiveItem où liveSessionId = session.id ; reservations où liveSessionId = session.id ; releaseReservation(tenantId, liveItemId) | Si on garde une « session » pour l’affichage : filtrer les items catalogue « ajoutés pendant ce live » (ex. lien session ↔ item ou created_at). Sinon afficher le catalogue ou un sous-ensemble. releaseReservation doit fonctionner sur l’item catalogue lié à la réservation. |
| `src/server/live-session/service.ts` | getOrCreateCurrentSession ; getCurrentSessionReadOnly | Garder pour : (1) affichage Live Ops « session en cours » si on garde ce concept ; (2) optionnel vendeur « créer item en live » = upsert catalogue + lien à la session. Ne plus utiliser pour le flux **client** « code » (réservation). |

### 3. Création d’items (vendeur WhatsApp)

| Fichier | Rôle actuel | Ajustement |
|---------|-------------|------------|
| `src/server/workers/webhook-processor.ts` | Intent vendeur code / code x qte → createLiveItem(tenantId, code, ...) qui appelle getOrCreateCurrentSession puis crée LiveItem | Remplacer (ou compléter) par upsert catalogue uniquement. Optionnel : si session active, lier l’item catalogue à la session pour Live Ops (story 8.2). |
| `src/server/live-item/createLiveItem.ts` | getOrCreateCurrentSession(tenantId) ; create LiveItem dans cette session | Faire évoluer vers upsert catalogue (nouveau module catalogue) ; plus de création LiveItem pour le stock, ou création LiveItem uniquement pour lien « affichage live » (story 8.2). |
| `src/server/live-item/getLastEditedLiveItemInWindow.ts` | getOrCreateCurrentSession ; dernier LiveItem édité en session | Si on garde « photo → dernier code en live » : dernier item catalogue créé/mis à jour dans une fenêtre (par tenant), ou dernier item lié à la session courante. |

### 4. Réservation : adresse, OUI, commande, TTL, waitlist

| Fichier | Rôle actuel | Ajustement |
|---------|-------------|------------|
| `src/server/workers/webhook-processor.ts` | Collecte adresse / OUI : getActiveReservationForClient(tenantId, clientPhone) ; confirmation avec liveSessionId | getActiveReservationForClient doit retrouver la réservation (déjà par tenant + client) ; la réservation pointe vers catalogueItemId. Pas de changement de logique métier si Reservation contient catalogueItemId. |
| `src/server/reservation/service.ts` | getActiveReservationForClient, collectAddress, confirmReservation ; tous utilisent liveSessionId dans les where / create | Où c’est utilisé pour filtre : s’assurer que les réservations « catalogue » (liveSessionId null ou optionnel) sont bien prises en compte. |
| `src/server/order/createOrderFromReservation.ts` | Lit Reservation (+ liveItem) pour créer Order | Order / Reservation : si Reservation a catalogueItemId, affichage commande doit utiliser catalogueItem (code, etc.) au lieu de liveItem. |
| `src/server/api/routers/orders.ts` | Liste commandes avec reservation.liveItem.code | Adapter pour reservation.catalogueItem?.code ou reservation.liveItem?.code selon schéma (polymorphisme ou champ unique). |
| `src/server/workers/reservation-ttl.ts` | Expire les réservations ; promotion waitlist ; createReservation(tenantId, **liveSessionId**, liveItemId, ...) | createReservation avec catalogueItemId (liveSessionId optionnel). Waitlist : si on garde waitlist par (liveSessionId, liveItemId), faire évoluer vers (catalogueItemId) ou garder liveSessionId pour compat. |
| `src/server/waitlist/addToWaitlist.ts` | (tenantId, liveSessionId, liveItemId, clientPhone, ...) | Si les réservations sont sur catalogue : waitlist par (tenantId, catalogueItemId, clientPhone) ou conserver liveSessionId pour traçabilité. |

### 5. Event log & workers

| Fichier | Rôle actuel | Ajustement |
|---------|-------------|------------|
| `src/server/events/eventLog.ts` | logLiveSessionCreated, logLiveSessionClosed, logReservationStarted(..., live_session_id), etc. | Garder les événements ; payload peut contenir catalogue_item_id en plus ou à la place de live_session_id / live_item_id selon besoin. |
| `src/server/workers/close-inactive-live-sessions.ts` | Met status = closed sur les sessions inactives | Plus de « promotion session → catalogue » si tout est déjà au catalogue. Conserver le job pour fermer les sessions (affichage Live Ops, traçabilité). Option : migration unique des LiveItem existants vers catalogue (story 8.2). |

### 6. Dashboard & API

| Fichier | Rôle actuel | Ajustement |
|---------|-------------|------------|
| `src/server/api/routers/dashboard.ts` | getCurrentSessionReadOnly ; hasLiveSession | Inchangé si on garde le concept de session (affichage « En cours » / « Inactif »). |
| `src/app/(dashboard)/dashboard/_components/dashboard-content.tsx` | Affiche hasLiveSession, « Voir le live » / « Lancer le live » | Inchangé si on garde une session pour le live. |
| `src/server/api/routers/dashboard.schema.ts` | hasLiveSession: z.boolean() | Inchangé. |

### 7. Schéma Prisma & contraintes

| Élément | Rôle actuel | Ajustement |
|---------|-------------|------------|
| LiveSession | Une session active par tenant, fermée par job | Garder pour affichage « live en cours » et optionnellement lien items présentés. |
| LiveItem | (tenantId, liveSessionId, code) unique ; stock | Soit supprimer pour le stock (tout en CatalogueItem), soit garder pour lien « item présenté en live » (affichage uniquement). |
| Reservation | liveSessionId, liveItemId requis ; idempotence (tenant, liveSessionId, client, liveItemId) | Ajouter catalogueItemId (ou remplacer liveItemId par item « polymorphique »). liveSessionId optionnel. Idempotence sur (tenant, client, catalogueItemId). |
| Waitlist | (tenantId, liveSessionId, clientPhone, liveItemId) | Faire évoluer vers catalogueItemId (ou garder liveSessionId pour traçabilité). |
| Order | Via Reservation → LiveItem | Order inchangé ; Reservation pointe vers CatalogueItem (ou LiveItem si conservé). |

### 8. Tests à adapter

- `webhook-processor.test.ts` : mocker getCurrentSessionReadOnly (session active vs null) ; avec session → findOrCreateOrderableItemByCode, code absent → création puis Réservé ; sans session → findOrderableItemByCode seul, code absent → Code inconnu ; createReservation avec catalogueItemId.
- `reservation/service.test.ts` : createReservation avec catalogueItemId (et liveSessionId optionnel).
- `live.test.ts` : getLiveOpsData / getSessionItems : si les items viennent du catalogue filtré par session, adapter les mocks.
- `findLiveItemByCode.test.ts` : garder pour lookup par session si conservé ; ajouter tests findOrderableItemByCode et findOrCreateOrderableItemByCode (création à la volée si code absent).
- `reservation-ttl.test.ts`, `addToWaitlist` tests : adapter si waitlist / réservation passent sur catalogueItemId.

**Couverture par les stories :**
- **§1 Webhook & réservation client** → 8.1 Task 3 (webhook + getCurrentSessionReadOnly, findOrCreate vs find only), Task 4 (createReservation, reserveOneUnit, orders).
- **§2 Live Ops** → 8.1 Task 5.
- **§3 Création d’items vendeur** → 8.2 Task 4 ; getLastEditedLiveItemInWindow → 8.2 Dev Notes.
- **§4 Adresse, OUI, commande, TTL, waitlist** → 8.1 Task 4, Task 5.
- **§5 Event log & close-inactive** → 8.1 Dev Notes ; 8.2 Task 1.
- **§6 Dashboard / session** → 8.3 (bouton Lancer le live → startLive).
- **§7 Schéma Prisma** → 8.1 Task 1 ; Waitlist → 8.1 Task 5.
- **§8 Tests** → 8.1 Task 6 ; 8.3 tests startLive.

## File List

### New Files
- `src/server/catalogue/findOrderableItemByCode.ts` — lookup catalogue (tenant, code)
- `src/server/catalogue/findOrderableItemByCode.test.ts` — tests
- `src/server/catalogue/findOrCreateOrderableItemByCode.ts` — find or create catalogue item
- `src/server/catalogue/findOrCreateOrderableItemByCode.test.ts` — tests
- `prisma/migrations/20260210210000_add_catalogue_item_story_8_1/migration.sql` — SQL migration
- `prisma/migrations/20260210220000_add_catalogue_items_check_constraints/migration.sql` — CHECK constraints (review fix)

### Modified Files
- `prisma/schema.prisma` — added CatalogueItem model, Reservation.catalogueItemId, made liveSessionId/liveItemId optional
- `generated/prisma/schema.prisma` — idem (copie générée)
- `src/server/live-item/reservation.ts` — exported StockTable type; reserveOneUnit/releaseReservation/confirmReservation accept `table` param; runtime validation for Prisma.raw (review fix)
- `src/server/events/eventLog.ts` — added "catalogue_item" to EntityType
- `src/server/reservation/service.ts` — createReservation overload for catalogueItemId; getActiveReservationForClient/collectAddress signatures simplified (no liveSessionId)
- `src/server/order/createOrderFromReservation.ts` — include catalogueItem; resolve stock table; AC#5 code release
- `src/server/api/routers/orders.ts` — display catalogueItem?.code in list/export/getById
- `src/server/workers/webhook-processor.ts` — client code intent uses getCurrentSessionReadOnly + findOrCreateOrderableItemByCode/findOrderableItemByCode; CATALOGUE_SESSION_SENTINEL (review fix)
- `src/server/api/routers/live.ts` — releaseReservation on catalogue items; null-safety guards (review fix); CATALOGUE_SESSION_SENTINEL
- `src/server/waitlist/addToWaitlist.ts` — table param for catalogue_items lock; runtime validation; exported CATALOGUE_SESSION_SENTINEL (review fix)
- `src/server/workers/reservation-ttl.ts` — catalogue item support for expiration + promotion; null-safety guard; CATALOGUE_SESSION_SENTINEL; removed redundant DB query (review fix)
- `src/server/live-item/reservation.test.ts` — updated logEvent payload expectations
- `src/server/reservation/service.test.ts` — updated signatures and expectations
- `src/server/order/createOrderFromReservation.test.ts` — updated for catalogue support
- `src/server/workers/webhook-processor.test.ts` — updated 11 tests for catalogue-based flow
- `src/server/api/routers/live.test.ts` — updated 3 tests + 3 new catalogue tests (review fix)
- `src/server/workers/reservation-ttl.test.ts` — 4 new catalogue tests (review fix)
- `src/server/waitlist/addToWaitlist.test.ts` — 2 new catalogue table tests (review fix)

## Change Log

- **Story 8.1 Implementation**: Introduced persistent product catalogue (`CatalogueItem`) as single source of truth for orderable items. Migrated reservation flow from LiveItem-centric to CatalogueItem-centric. Client code intent now uses `getCurrentSessionReadOnly` (read-only, no session creation) and resolves items via catalogue lookup. Live session = `findOrCreateOrderableItemByCode` (create on the fly); no session = `findOrderableItemByCode` (lookup only, code absent → "Code inconnu"). All stock operations (reserve/release/confirm), order creation, Live Ops, waitlist, and TTL adapted for polymorphic item support (live_items or catalogue_items via `table` parameter). AC#5: codes released after sale for `createdInLive` items when qty reaches 0. 461 tests pass, 0 regressions.
- **Code Review Fixes (AI-Review)**: 10 issues found and fixed. CRITICAL: Prisma schema was missing CatalogueItem model and Reservation updates (schema source never updated — tests passed only because DB was mocked). HIGH: null-safety guards in live.ts and reservation-ttl.ts, 9 missing catalogue tests added. MEDIUM: runtime validation for Prisma.raw, CATALOGUE_SESSION_SENTINEL constant, removed unnecessary DB query, CHECK constraints migration. Post-fix: 470 tests pass, 0 failures.

## Dev Agent Record

### Implementation Notes
- **Partial unique indexes**: Prisma's `@@unique` doesn't support nullable fields for idempotence, so the migration uses raw SQL partial unique indexes: `reservations_tenant_session_client_item_key` (liveItem path) and `reservations_tenant_catalogue_client_active_key` (catalogue path, filtered by active statuses).
- **StockTable polymorphism**: `reserveOneUnit`, `releaseReservation`, `confirmReservation` accept an optional `table` parameter (`"live_items" | "catalogue_items"`) to operate on either table via raw SQL.
- **Waitlist**: Schema kept as-is (no migration needed); `addToWaitlist` accepts `table` option to lock on the correct table. Catalogue item IDs stored in `liveItemId` field for compatibility.
- **Backward compat**: All existing LiveItem-based flows continue to work. New catalogue paths are additive.
- **Test results**: 42 files, 470 tests passed, 7 skipped, 0 failures.

### Code Review Fixes Applied
1. **CRITICAL**: Prisma schema updated — CatalogueItem model + Reservation optional fields + catalogueItemId added to both `prisma/schema.prisma` and `generated/prisma/schema.prisma`. Client regenerated.
2. **HIGH**: Null-safety guards added in `live.ts` (releaseReservation) and `reservation-ttl.ts` (TTL job) — prevent crash when neither liveItemId nor catalogueItemId is set.
3. **HIGH**: 4 catalogue tests added to `reservation-ttl.test.ts` (expiration, promotion, skip, reminder).
4. **HIGH**: 2 catalogue tests added to `addToWaitlist.test.ts` (table param, not_found).
5. **HIGH**: 3 catalogue tests added to `live.test.ts` (release, promotion, null guard).
6. **MEDIUM**: Runtime validation for `Prisma.raw(table)` in `reservation.ts` and `addToWaitlist.ts`.
7. **MEDIUM**: Extracted `CATALOGUE_SESSION_SENTINEL` constant — replaces magic string `"catalogue"` across 3 files.
8. **MEDIUM**: `reservation-ttl.ts` — use `res.liveItem?.code` instead of unnecessary `db.liveItem.findUnique()`.
9. **MEDIUM**: New migration `20260210220000` with CHECK constraints (`quantity >= 0`, `available_qty >= 0`, `reserved_qty >= 0`) on `catalogue_items`.
