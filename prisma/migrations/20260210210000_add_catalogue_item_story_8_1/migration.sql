-- Story 8.1: Catalogue persistant et réservation par code (tenant, code)
-- Ajoute la table catalogue_items et adapte reservations pour supporter catalogueItemId.

-- 1. Créer la table catalogue_items (source unique d'articles commandables)
CREATE TABLE "catalogue_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "amount_cents" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "available_qty" INTEGER NOT NULL DEFAULT 1,
    "reserved_qty" INTEGER NOT NULL DEFAULT 0,
    "media_storage_key" TEXT,
    "created_in_live" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalogue_items_pkey" PRIMARY KEY ("id")
);

-- Index et contraintes catalogue_items
CREATE UNIQUE INDEX "catalogue_items_tenant_id_code_key" ON "catalogue_items"("tenant_id", "code");
CREATE INDEX "catalogue_items_tenant_id_idx" ON "catalogue_items"("tenant_id");

-- FK catalogue_items → tenants
ALTER TABLE "catalogue_items" ADD CONSTRAINT "catalogue_items_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Adapter la table reservations

-- Ajouter catalogue_item_id (optionnel pour rétrocompat)
ALTER TABLE "reservations" ADD COLUMN "catalogue_item_id" TEXT;

-- Rendre live_session_id et live_item_id optionnels (réservations catalogue sans session)
ALTER TABLE "reservations" ALTER COLUMN "live_session_id" DROP NOT NULL;
ALTER TABLE "reservations" ALTER COLUMN "live_item_id" DROP NOT NULL;

-- Supprimer l'ancienne contrainte unique non-partielle
DROP INDEX IF EXISTS "reservations_tenant_id_live_session_id_client_phone_live_ite_key";

-- Contrainte unique partielle pour rétrocompat (reservations legacy avec liveSessionId + liveItemId)
CREATE UNIQUE INDEX "reservations_tenant_session_client_item_key"
    ON "reservations"("tenant_id", "live_session_id", "client_phone", "live_item_id")
    WHERE "live_session_id" IS NOT NULL AND "live_item_id" IS NOT NULL;

-- Contrainte unique partielle pour idempotence catalogue (reservations actives sur catalogueItem)
CREATE UNIQUE INDEX "reservations_tenant_catalogue_client_active_key"
    ON "reservations"("tenant_id", "client_phone", "catalogue_item_id")
    WHERE "catalogue_item_id" IS NOT NULL AND "status" IN ('reserved', 'address_collected');

-- Index pour lookups par catalogue_item_id
CREATE INDEX "reservations_catalogue_item_id_idx" ON "reservations"("catalogue_item_id");

-- FK reservations → catalogue_items
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_catalogue_item_id_fkey"
    FOREIGN KEY ("catalogue_item_id") REFERENCES "catalogue_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
