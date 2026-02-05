-- CreateEnum: LiveSessionStatus (Story 2.6)
DO $$ BEGIN
    CREATE TYPE "LiveSessionStatus" AS ENUM ('active', 'closed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable: LiveSession - création/fermeture auto session live
CREATE TABLE IF NOT EXISTS "live_sessions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "status" "LiveSessionStatus" NOT NULL DEFAULT 'active',
    "last_activity_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_sessions_pkey" PRIMARY KEY ("id")
);

-- Index pour requête session active par tenant
CREATE INDEX IF NOT EXISTS "live_sessions_tenant_id_status_idx" ON "live_sessions"("tenant_id", "status");

-- FK vers tenants (IF NOT EXISTS non supporté pour ALTER TABLE ADD CONSTRAINT, utiliser DO block)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'live_sessions_tenant_id_fkey'
    ) THEN
        ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
