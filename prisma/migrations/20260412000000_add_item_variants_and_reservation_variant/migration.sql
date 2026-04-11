-- Migration: add_item_variants_and_reservation_variant
-- Adds:
--   1. item_variants table (ItemVariant model)
--   2. variant_id and quantity columns to reservations

-- ─── 1. item_variants ─────────────────────────────────────────────────────
CREATE TABLE "item_variants" (
    "id"               TEXT         NOT NULL,
    "tenant_id"        TEXT         NOT NULL,
    "catalogue_item_id" TEXT,
    "live_item_id"     TEXT,
    "label"            TEXT         NOT NULL,
    "values"           JSONB        NOT NULL,
    "quantity"         INTEGER      NOT NULL DEFAULT 0,
    "available_qty"    INTEGER      NOT NULL DEFAULT 0,
    "reserved_qty"     INTEGER      NOT NULL DEFAULT 0,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_variants_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "item_variants_tenant_id_idx" ON "item_variants"("tenant_id");
CREATE INDEX "item_variants_catalogue_item_id_idx" ON "item_variants"("catalogue_item_id");
CREATE INDEX "item_variants_live_item_id_idx" ON "item_variants"("live_item_id");

-- Foreign keys
ALTER TABLE "item_variants"
    ADD CONSTRAINT "item_variants_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "item_variants"
    ADD CONSTRAINT "item_variants_catalogue_item_id_fkey"
    FOREIGN KEY ("catalogue_item_id") REFERENCES "catalogue_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "item_variants"
    ADD CONSTRAINT "item_variants_live_item_id_fkey"
    FOREIGN KEY ("live_item_id") REFERENCES "live_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 2. reservations: add variant_id and quantity ─────────────────────────
ALTER TABLE "reservations"
    ADD COLUMN IF NOT EXISTS "quantity"   INTEGER DEFAULT 1 NOT NULL,
    ADD COLUMN IF NOT EXISTS "variant_id" TEXT;

ALTER TABLE "reservations"
    ADD CONSTRAINT "reservations_variant_id_fkey"
    FOREIGN KEY ("variant_id") REFERENCES "item_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
