-- Story 8.1 (review fix): Ajouter les CHECK constraints sur catalogue_items
-- pour garantir l'intégrité des données de stock au niveau DB.

ALTER TABLE "catalogue_items" ADD CONSTRAINT "catalogue_items_quantity_non_negative"
  CHECK ("quantity" >= 0);

ALTER TABLE "catalogue_items" ADD CONSTRAINT "catalogue_items_available_qty_non_negative"
  CHECK ("available_qty" >= 0);

ALTER TABLE "catalogue_items" ADD CONSTRAINT "catalogue_items_reserved_qty_non_negative"
  CHECK ("reserved_qty" >= 0);
