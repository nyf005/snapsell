-- Deux correctifs révélés par les tests d'intégration lancés sur une vraie base.
--
-- Tout est idempotent : cette migration doit pouvoir s'appliquer aussi bien sur
-- une base montée au `db push` (où les index partiels n'ont jamais existé) que
-- sur une base déjà à jour.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. File d'attente : rétablir les index uniques partiels.
--
-- Ils avaient été créés par 20260212000000, mais Prisma ne sait pas exprimer un
-- index partiel : ils n'apparaissent donc pas dans `schema.prisma`, et un
-- `prisma db push` les efface sans rien dire. Sans eux, `addToWaitlist` n'a
-- aucune idempotence — son contrôle d'existence précède la transaction, et son
-- rattrapage P2002 est du code mort. Quatre messages simultanés d'une même
-- cliente créaient quatre places ; à la libération d'une pièce, deux personnes
-- se voyaient promettre la même unité.
-- ─────────────────────────────────────────────────────────────────────────────

-- Dédoublonner d'abord, sinon la création de l'index échoue.
-- On garde la ligne au plus petit `id` de chaque groupe.
DELETE FROM "waitlist" a
USING "waitlist" b
WHERE a."id" > b."id"
  AND a."tenant_id"    = b."tenant_id"
  AND a."client_phone" = b."client_phone"
  AND a."live_item_id" IS NOT NULL
  AND b."live_item_id" IS NOT NULL
  AND a."live_item_id" = b."live_item_id"
  AND a."live_session_id" IS NOT DISTINCT FROM b."live_session_id";

DELETE FROM "waitlist" a
USING "waitlist" b
WHERE a."id" > b."id"
  AND a."tenant_id"         = b."tenant_id"
  AND a."client_phone"      = b."client_phone"
  AND a."catalogue_item_id" IS NOT NULL
  AND b."catalogue_item_id" IS NOT NULL
  AND a."catalogue_item_id" = b."catalogue_item_id";

CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_live_unique"
  ON "waitlist"("tenant_id", "live_session_id", "client_phone", "live_item_id")
  WHERE "live_item_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_catalogue_unique"
  ON "waitlist"("tenant_id", "catalogue_item_id", "client_phone")
  WHERE "catalogue_item_id" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Numéro de commande : un compteur par boutique, incrémenté atomiquement.
--
-- Il venait de `COUNT(*) + 1`, qui n'est pas atomique : cinq confirmations
-- simultanées visaient le même SS-000N. La contrainte unique en refusait
-- quatre, le code rejouait — mais trois fois au plus, et l'erreur finissait par
-- remonter : vente perdue en plein live. `COUNT(*)` réattribuait aussi un
-- numéro déjà utilisé dès qu'une commande était supprimée.
--
-- L'`UPDATE … RETURNING` sur la ligne boutique prend un verrou de ligne : les
-- transactions concurrentes se sérialisent, chacune repart avec son numéro.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "order_seq" INTEGER NOT NULL DEFAULT 0;

-- Reprise depuis le plus grand numéro existant, et non depuis le nombre de
-- commandes : en cas de trou, on ne doit jamais réattribuer un numéro déjà pris.
UPDATE "tenants" t
SET "order_seq" = COALESCE((
  SELECT MAX(CAST(SUBSTRING(o."order_number" FROM '^SS-([0-9]+)$') AS INTEGER))
  FROM "orders" o
  WHERE o."tenant_id" = t."id"
    AND o."order_number" ~ '^SS-[0-9]+$'
), 0)
WHERE "order_seq" = 0;
