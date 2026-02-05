-- CreateTable: SellerPhone pour distinguer vendeur vs client (Story 2.2)
-- Migration pour modèle SellerPhone avec contrainte UNIQUE (tenant_id, phone_number)

-- Créer la table seller_phones
CREATE TABLE IF NOT EXISTS "seller_phones" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_phones_pkey" PRIMARY KEY ("id")
);

-- Créer contrainte UNIQUE pour éviter doublons (tenant_id, phone_number)
CREATE UNIQUE INDEX IF NOT EXISTS "seller_phones_tenant_id_phone_number_key" 
ON "seller_phones"("tenant_id", "phone_number");

-- Créer index sur tenant_id pour lookup rapide
CREATE INDEX IF NOT EXISTS "seller_phones_tenant_id_idx" ON "seller_phones"("tenant_id");

-- Ajouter foreign key vers tenants (avec CASCADE on delete)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'seller_phones_tenant_id_fkey'
    ) THEN
        ALTER TABLE "seller_phones" 
        ADD CONSTRAINT "seller_phones_tenant_id_fkey" 
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") 
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
