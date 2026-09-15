CREATE TABLE "whatsapp_signup_attempts" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "input_hash" TEXT NOT NULL,
  "encrypted_token" TEXT,
  "lease_owner" TEXT,
  "lease_until" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "phone_number_id" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_signup_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "whatsapp_signup_attempts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "whatsapp_signup_attempts_expires_at_idx" ON "whatsapp_signup_attempts"("expires_at");
