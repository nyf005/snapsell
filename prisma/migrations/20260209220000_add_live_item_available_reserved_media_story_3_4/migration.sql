-- Story 3.4: available_qty, reserved_qty for prepared stock; media_storage_key for optional photo
ALTER TABLE "live_items" ADD COLUMN "available_qty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "live_items" ADD COLUMN "reserved_qty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "live_items" ADD COLUMN "media_storage_key" TEXT;

-- Backfill: existing rows (article unique 3.3) → available_qty = quantity, reserved_qty = 0
UPDATE "live_items" SET "available_qty" = "quantity", "reserved_qty" = 0 WHERE "available_qty" = 0 AND "reserved_qty" = 0;
