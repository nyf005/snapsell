-- Story 5.3: Preuves d'acompte (valider/refuser)
CREATE TYPE "PaymentProofStatus" AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE "payment_proofs" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "media_storage_key" TEXT,
    "text_payload" TEXT,
    "status" "PaymentProofStatus" NOT NULL DEFAULT 'pending',
    "reviewed_at" TIMESTAMP(3),
    "correlation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_proofs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_proofs_tenant_id_idx" ON "payment_proofs"("tenant_id");
CREATE INDEX "payment_proofs_order_id_idx" ON "payment_proofs"("order_id");
CREATE INDEX "payment_proofs_tenant_id_status_idx" ON "payment_proofs"("tenant_id", "status");

ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
