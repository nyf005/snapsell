-- CreateTable: EventLog pour traçabilité des événements critiques (Story 2.3)
-- Architecture §9: Event Log avec correlationId pour diagnostic bout en bout
-- Architecture §426-430: event_type verbe/nom explicite, correlation_id propagé, payload JSON structuré sans PII

-- Créer la table event_log
CREATE TABLE IF NOT EXISTS "event_log" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "correlation_id" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_log_pkey" PRIMARY KEY ("id")
);

-- Créer index pour lookup rapide par flux (tenant_id, correlation_id)
CREATE INDEX IF NOT EXISTS "event_log_tenant_id_correlation_id_idx" 
ON "event_log"("tenant_id", "correlation_id");

-- Créer index pour filtrage par type et date (tenant_id, event_type, created_at)
CREATE INDEX IF NOT EXISTS "event_log_tenant_id_event_type_created_at_idx" 
ON "event_log"("tenant_id", "event_type", "created_at");

-- Créer index sur tenant_id seul pour isolation tenant
CREATE INDEX IF NOT EXISTS "event_log_tenant_id_idx" ON "event_log"("tenant_id");

-- Ajouter foreign key vers tenants (avec CASCADE on delete pour isolation tenant stricte)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'event_log_tenant_id_fkey'
    ) THEN
        ALTER TABLE "event_log" 
        ADD CONSTRAINT "event_log_tenant_id_fkey" 
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") 
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
