ALTER TABLE "tenants"
ADD COLUMN "assistant_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "assistant_updated_at" TIMESTAMP(3),
ADD COLUMN "assistant_updated_by" TEXT,
ADD COLUMN "assistant_activated_at" TIMESTAMP(3);
