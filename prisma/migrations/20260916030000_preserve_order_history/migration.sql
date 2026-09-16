-- Deleting an item/session must not erase reservations, orders and payment evidence.
ALTER TABLE "reservations" DROP CONSTRAINT "reservations_catalogue_item_id_fkey";
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_catalogue_item_id_fkey" FOREIGN KEY ("catalogue_item_id") REFERENCES "catalogue_items"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "reservations" DROP CONSTRAINT "reservations_live_item_id_fkey";
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_live_item_id_fkey" FOREIGN KEY ("live_item_id") REFERENCES "live_items"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "reservations" DROP CONSTRAINT "reservations_live_session_id_fkey";
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_live_session_id_fkey" FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
-- Align the editable stock counter with remaining inventory after historical sales.
UPDATE "catalogue_items" SET "quantity" = "available_qty";
UPDATE "live_items" SET "quantity" = "available_qty";
UPDATE "item_variants" SET "quantity" = "available_qty";
