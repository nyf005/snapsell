-- CreateTable: MessageOut pour outbox pattern (Story 2.4)
-- Architecture §4.5: Outbound messaging via outbox + retries + DLQ
-- Tout envoi sortant écrit d'abord dans MessageOut (outbox) avec statut pending

-- Créer la table messages_out
CREATE TABLE IF NOT EXISTS "messages_out" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "last_error" TEXT,
    "correlation_id" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_out_pkey" PRIMARY KEY ("id")
);

-- Créer index pour lookup rapide des messages pending (tenant_id, status)
CREATE INDEX IF NOT EXISTS "messages_out_tenant_id_status_idx" 
ON "messages_out"("tenant_id", "status");

-- Créer index pour traçabilité par correlationId (tenant_id, correlation_id)
CREATE INDEX IF NOT EXISTS "messages_out_tenant_id_correlation_id_idx" 
ON "messages_out"("tenant_id", "correlation_id");

-- Créer index sur tenant_id seul pour isolation tenant
CREATE INDEX IF NOT EXISTS "messages_out_tenant_id_idx" ON "messages_out"("tenant_id");

-- Ajouter foreign key vers tenants (avec CASCADE on delete pour isolation tenant stricte)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'messages_out_tenant_id_fkey'
    ) THEN
        ALTER TABLE "messages_out" 
        ADD CONSTRAINT "messages_out_tenant_id_fkey" 
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") 
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- CreateTable: DeadLetterJob pour DLQ après N échecs (Story 2.4)
-- Architecture §4.5: DLQ après échec répété pour traçabilité ops

-- Créer la table dead_letter_jobs
CREATE TABLE IF NOT EXISTS "dead_letter_jobs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "error_message" TEXT,
    "error_stack" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "dead_letter_jobs_pkey" PRIMARY KEY ("id")
);

-- Créer index pour filtrage ops (tenant_id, job_type, resolved_at)
CREATE INDEX IF NOT EXISTS "dead_letter_jobs_tenant_id_job_type_resolved_at_idx" 
ON "dead_letter_jobs"("tenant_id", "job_type", "resolved_at");

-- Créer index sur tenant_id seul pour isolation tenant
CREATE INDEX IF NOT EXISTS "dead_letter_jobs_tenant_id_idx" ON "dead_letter_jobs"("tenant_id");

-- Ajouter foreign key vers tenants (avec CASCADE on delete pour isolation tenant stricte)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'dead_letter_jobs_tenant_id_fkey'
    ) THEN
        ALTER TABLE "dead_letter_jobs" 
        ADD CONSTRAINT "dead_letter_jobs_tenant_id_fkey" 
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") 
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
