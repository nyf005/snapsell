-- CreateTable: MessageIn pour webhook WhatsApp (Story 2.1)
-- Migration pour modèle MessageIn avec idempotence (tenant_id, provider_message_id)

-- Créer la table messages_in
CREATE TABLE IF NOT EXISTS "messages_in" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "provider_message_id" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "media_url" TEXT,
    "correlation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_in_pkey" PRIMARY KEY ("id")
);

-- Créer contrainte UNIQUE pour idempotence (tenant_id, provider_message_id)
-- Note: tenant_id peut être NULL, donc on utilise des contraintes partielles
-- 1. Contrainte unique pour (tenant_id, provider_message_id) quand tenant_id IS NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS "messages_in_tenant_id_provider_message_id_key" 
ON "messages_in"("tenant_id", "provider_message_id") 
WHERE "tenant_id" IS NOT NULL;

-- 2. Contrainte unique pour provider_message_id seul quand tenant_id IS NULL
-- (pour garantir l'idempotence même si tenant non résolu)
CREATE UNIQUE INDEX IF NOT EXISTS "messages_in_provider_message_id_null_tenant_key"
ON "messages_in"("provider_message_id")
WHERE "tenant_id" IS NULL;

-- Créer index composite pour lookup rapide
CREATE INDEX IF NOT EXISTS "messages_in_tenant_id_provider_message_id_idx" 
ON "messages_in"("tenant_id", "provider_message_id");

-- Créer index sur tenant_id seul
CREATE INDEX IF NOT EXISTS "messages_in_tenant_id_idx" ON "messages_in"("tenant_id");

-- Ajouter foreign key vers tenants (avec SET NULL on delete)
-- Utiliser IF NOT EXISTS via DO block pour éviter erreur si contrainte existe déjà
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'messages_in_tenant_id_fkey'
    ) THEN
        ALTER TABLE "messages_in" 
        ADD CONSTRAINT "messages_in_tenant_id_fkey" 
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") 
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
