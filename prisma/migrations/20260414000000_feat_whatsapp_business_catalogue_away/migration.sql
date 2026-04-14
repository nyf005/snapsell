-- Migration: feat_whatsapp_business_catalogue_away
-- Adds:
--   1. CatalogueItem: name, metaProductId, syncedToMeta, metaSyncedAt
--   2. Tenant: metaCatalogId, hasMetaCatalogSync, businessHours, awayMessage

-- ─── 1. catalogue_items ───────────────────────────────────────────────────────

ALTER TABLE "catalogue_items"
    ADD COLUMN IF NOT EXISTS "name"            TEXT,
    ADD COLUMN IF NOT EXISTS "meta_product_id" TEXT,
    ADD COLUMN IF NOT EXISTS "synced_to_meta"  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "meta_synced_at"  TIMESTAMP(3);

-- ─── 2. tenants ───────────────────────────────────────────────────────────────

ALTER TABLE "tenants"
    ADD COLUMN IF NOT EXISTS "meta_catalog_id"        TEXT,
    ADD COLUMN IF NOT EXISTS "has_meta_catalog_sync"  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "business_hours_start"   TEXT,
    ADD COLUMN IF NOT EXISTS "business_hours_end"     TEXT,
    ADD COLUMN IF NOT EXISTS "business_timezone"      TEXT,
    ADD COLUMN IF NOT EXISTS "away_message"           TEXT;
