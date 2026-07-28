# Code Review — Story 4.3 (File d'attente et promotion)

**Story:** 4-3-file-dattente-et-promotion-automatique-a-lexpiration  
**Git vs File List:** Fichiers 4.3 listés dans la story (waitlist, reservation-ttl, eventLog, etc.) cohérents avec les ajouts/modifs. Fichiers non listés modifiés (autres stories) : .env.example, DEPLOYMENT.md, etc. — hors scope 4.3.

---

## CRITICAL / HIGH

### 1. [HIGH] Perte de place en file si `createReservation` échoue après promotion
**Fichier:** `src/server/workers/reservation-ttl.ts`  
**Lignes:** 79–81 (delete en transaction), 114–119 (createReservation après commit).

La waitlist est supprimée **dans** la transaction (avant d’appeler `createReservation`). Si `createReservation` échoue (ex. `exhausted` en cas de race), le client a déjà été retiré de la file et n’a pas de réservation → **perte de place**.

**Correction:** Ne pas supprimer l’entrée waitlist dans la transaction. Retourner l’id de l’entrée (ex. `waitlistId`). Supprimer l’entrée **uniquement après** un `createReservation` réussi.

---

## MEDIUM

### 2. [MEDIUM] `.env.example` ne documente pas `RESERVATION_TTL_MINUTES`
**Fichier:** `.env.example`  
La variable `RESERVATION_TTL_MINUTES` (Story 4.3, 5–15 min, défaut 10) est utilisée en prod mais absente de `.env.example` → déploiement sans doc.

**Correction:** Ajouter un commentaire + ligne (commentée) dans `.env.example` et dans le tableau déploiement si pertinent.

### 3. [MEDIUM] Race P2002 dans `addToWaitlist` non gérée
**Fichier:** `src/server/waitlist/addToWaitlist.ts`  
Entre `findUnique` (ligne 25) et `tx.waitlist.create` (ligne 59), une autre requête peut insérer la même clé (tenant, session, client, item) → Prisma P2002 (unique violation). Actuellement l’erreur remonte et le client reçoit une erreur au lieu d’être idempotent.

**Correction:** En catch de la transaction (ou du create), détecter P2002, refaire un `findUnique` et retourner `{ ok: true, position: existing.position, alreadyInWaitlist: true }`.

---

## LOW

### 4. [LOW] Import inutilisé dans `reservation-ttl.ts`
**Fichier:** `src/server/workers/reservation-ttl.ts` ligne 10  
`import { reserveOneUnit } from "~/server/live-item/reservation"` — non utilisé (`createReservation` fait la réservation).

**Correction:** Supprimer l’import.

### 5. [LOW] Test manquant : promotion + échec `createReservation`
**Fichier:** `src/server/workers/reservation-ttl.test.ts`  
Aucun cas où `createReservation` retourne `exhausted` (ou autre échec) après une promotion. Utile pour valider qu’après correction du point 1, le client reste en file (waitlist non supprimée).

**Correction:** Ajouter un test qui mock `createReservation` en échec et vérifie que l’entrée waitlist n’est pas supprimée (ou que le comportement attendu est documenté).

---

**Résumé :** 1 HIGH, 2 MEDIUM, 2 LOW. Les correctifs 1 (HIGH), 2 (MEDIUM), 3 (MEDIUM), 4 (LOW) sont appliqués ci-dessous. Le point 5 (LOW) peut être ajouté comme test optionnel.
