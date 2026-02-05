-- CreateTable: OptOut pour respect STOP scope tenant (Story 2.5)
-- Isolation tenant stricte, UNIQUE (tenant_id, phone_number), index pour lookup rapide
CREATE TABLE IF NOT EXISTS "opt_outs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "opted_out_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opt_outs_pkey" PRIMARY KEY ("id")
);

-- Contrainte UNIQUE pour éviter doublons (tenant_id, phone_number) — crée l'index pour lookup
CREATE UNIQUE INDEX IF NOT EXISTS "opt_outs_tenant_id_phone_number_key" ON "opt_outs"("tenant_id", "phone_number");

-- FK vers tenants (IF NOT EXISTS non supporté pour ALTER TABLE ADD CONSTRAINT, utiliser DO block)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'opt_outs_tenant_id_fkey'
    ) THEN
        ALTER TABLE "opt_outs" ADD CONSTRAINT "opt_outs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
