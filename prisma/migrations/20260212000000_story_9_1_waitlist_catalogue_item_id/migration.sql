-- Story 9.1: Refactorer CATALOGUE_SESSION_SENTINEL dans Waitlist
-- Ajoute catalogue_item_id nullable, rend live_session_id et live_item_id nullable,
-- ajoute CHECK constraint et partial unique indexes, migre données existantes.

-- 1. Ajouter catalogue_item_id nullable
ALTER TABLE "waitlist" ADD COLUMN "catalogue_item_id" TEXT;

-- 2. Rendre live_session_id et live_item_id nullable
ALTER TABLE "waitlist" ALTER COLUMN "live_session_id" DROP NOT NULL;
ALTER TABLE "waitlist" ALTER COLUMN "live_item_id" DROP NOT NULL;

-- 3. Migrer les données existantes : entrées avec live_session_id = 'catalogue' (sentinel)
-- → catalogue_item_id = live_item_id, live_item_id = NULL, live_session_id = NULL
UPDATE "waitlist"
SET "catalogue_item_id" = "live_item_id",
    "live_item_id" = NULL,
    "live_session_id" = NULL
WHERE "live_session_id" = 'catalogue';

-- 4. Supprimer l'ancien index unique non-partiel
DROP INDEX IF EXISTS "waitlist_tenant_id_live_session_id_client_phone_live_item_id_key";

-- 5. Créer les partial unique indexes (Option A recommandée dans Dev Notes)
-- Index unique pour entrées live (liveItemId + liveSessionId non null)
CREATE UNIQUE INDEX "waitlist_live_unique"
  ON "waitlist"("tenant_id", "live_session_id", "client_phone", "live_item_id")
  WHERE "live_item_id" IS NOT NULL;

-- Index unique pour entrées catalogue (catalogueItemId non null)
CREATE UNIQUE INDEX "waitlist_catalogue_unique"
  ON "waitlist"("tenant_id", "catalogue_item_id", "client_phone")
  WHERE "catalogue_item_id" IS NOT NULL;

-- 6. Index pour lookups par catalogue_item_id
CREATE INDEX "waitlist_catalogue_item_id_idx" ON "waitlist"("catalogue_item_id");

-- 7. CHECK constraint : exactement l'un des deux groupes est renseigné (XOR exclusif)
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_item_check"
  CHECK (
    ("live_item_id" IS NOT NULL AND "live_session_id" IS NOT NULL AND "catalogue_item_id" IS NULL)
    OR ("catalogue_item_id" IS NOT NULL AND "live_item_id" IS NULL AND "live_session_id" IS NULL)
  );

-- 8. FK waitlist → catalogue_items (CASCADE : supprimer les entrées waitlist si l'item catalogue est supprimé)
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_catalogue_item_id_fkey"
  FOREIGN KEY ("catalogue_item_id") REFERENCES "catalogue_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
