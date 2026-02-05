-- DropColumn (if previous migration added it)
ALTER TABLE "tenants" DROP COLUMN IF EXISTS "delivery_fee_cents";

-- CreateTable: zones de livraison (regroupent plusieurs communes)
CREATE TABLE "delivery_zones" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable: communes dans une zone (nom uniquement, pas de code — Côte d'Ivoire)
CREATE TABLE "delivery_zone_communes" (
    "id" TEXT NOT NULL,
    "zone_id" TEXT NOT NULL,
    "commune_name" TEXT NOT NULL,

    CONSTRAINT "delivery_zone_communes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: prix par commune (hors zone), identifié par nom
CREATE TABLE "delivery_fee_communes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "commune_name" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_fee_communes_pkey" PRIMARY KEY ("id")
);

-- Indexes & uniques
CREATE INDEX "delivery_zones_tenant_id_idx" ON "delivery_zones"("tenant_id");
CREATE INDEX "delivery_zone_communes_zone_id_idx" ON "delivery_zone_communes"("zone_id");
CREATE UNIQUE INDEX "delivery_zone_communes_zone_id_commune_name_key" ON "delivery_zone_communes"("zone_id", "commune_name");
CREATE UNIQUE INDEX "delivery_fee_communes_tenant_id_commune_name_key" ON "delivery_fee_communes"("tenant_id", "commune_name");
CREATE INDEX "delivery_fee_communes_tenant_id_idx" ON "delivery_fee_communes"("tenant_id");

-- FKs
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_zone_communes" ADD CONSTRAINT "delivery_zone_communes_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_fee_communes" ADD CONSTRAINT "delivery_fee_communes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
