-- Rattrapage additif : colonnes utilisées par le code mais absentes des migrations historiques.
-- AlterTable
ALTER TABLE "catalogue_items" ADD COLUMN IF NOT EXISTS "attributes" JSONB;

-- AlterTable
ALTER TABLE "conversation_states" ADD COLUMN IF NOT EXISTS "metadata" JSONB,
ADD COLUMN IF NOT EXISTS "state" TEXT;

-- AlterTable
ALTER TABLE "live_items" ADD COLUMN IF NOT EXISTS "attributes" JSONB;

-- AlterTable
ALTER TABLE "messages_out" ADD COLUMN IF NOT EXISTS "is_typing_indicator" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "body" DROP NOT NULL;

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "address_city" TEXT,
ADD COLUMN IF NOT EXISTS "address_commune" TEXT,
ADD COLUMN IF NOT EXISTS "address_details" TEXT,
ADD COLUMN IF NOT EXISTS "address_raw" TEXT,
ADD COLUMN IF NOT EXISTS "address_zone" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "credits_balance" INTEGER NOT NULL DEFAULT 70,
ADD COLUMN IF NOT EXISTS "credits_bonus" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "credits_total_monthly" INTEGER NOT NULL DEFAULT 70,
ADD COLUMN IF NOT EXISTS "has_ai" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "low_credits_alerted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "usage_reset_date" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "conversation_windows" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_windows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "conversation_windows_tenant_id_customer_phone_idx" ON "conversation_windows"("tenant_id", "customer_phone");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "conversation_windows_tenant_id_expires_at_idx" ON "conversation_windows"("tenant_id", "expires_at");

-- Compatible avec les environnements synchronisés auparavant via db push.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversation_windows_tenant_id_fkey') THEN
    ALTER TABLE "conversation_windows" ADD CONSTRAINT "conversation_windows_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
