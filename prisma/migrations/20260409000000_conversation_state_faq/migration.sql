-- Phase 5.1: ConversationState — état de conversation par client (handoff)
CREATE TABLE "conversation_states" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "handed_off" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversation_states_tenant_id_phone_key" ON "conversation_states"("tenant_id", "phone");
CREATE INDEX "conversation_states_tenant_id_idx" ON "conversation_states"("tenant_id");

ALTER TABLE "conversation_states" ADD CONSTRAINT "conversation_states_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase 5.3: FAQ configurable par tenant
ALTER TABLE "tenants" ADD COLUMN "faq_delivery"     TEXT;
ALTER TABLE "tenants" ADD COLUMN "faq_payment"      TEXT;
ALTER TABLE "tenants" ADD COLUMN "faq_location"     TEXT;
ALTER TABLE "tenants" ADD COLUMN "faq_availability" TEXT;
