ALTER TABLE "messages_out" ADD COLUMN "purpose" TEXT;
CREATE TABLE "conversation_metrics" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "handed_off" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "conversation_metrics_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversation_metrics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "conversation_metrics_tenant_id_started_at_idx" ON "conversation_metrics"("tenant_id", "started_at");
