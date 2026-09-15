ALTER TABLE "messages_in" ADD COLUMN "provider_sent_at" TIMESTAMP(3);
ALTER TABLE "messages_out" ADD COLUMN "notification_context" JSONB;
CREATE INDEX "messages_in_tenant_from_provider_sent_idx" ON "messages_in"("tenant_id", "from", "provider_sent_at");
CREATE TABLE "messaging_consents" (
 "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "phone" TEXT NOT NULL, "scope" TEXT NOT NULL,
 "source_message_id" TEXT NOT NULL, "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "messaging_consents_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "messaging_consents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "messaging_consents_tenant_id_phone_scope_key" ON "messaging_consents"("tenant_id", "phone", "scope");
