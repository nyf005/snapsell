-- Add UNIQUE constraint on (tenant_id, correlation_id, to) to messages_out (Story 2.4 - anti-doublon)
CREATE UNIQUE INDEX IF NOT EXISTS "messages_out_tenant_id_correlation_id_to_key" ON "messages_out"("tenant_id", "correlation_id", "to");
