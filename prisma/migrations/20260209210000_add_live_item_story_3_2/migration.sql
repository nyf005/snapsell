-- CreateTable
CREATE TABLE "live_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "live_session_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "amount_cents" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "live_items_tenant_id_live_session_id_code_key" ON "live_items"("tenant_id", "live_session_id", "code");

-- CreateIndex
CREATE INDEX "live_items_tenant_id_idx" ON "live_items"("tenant_id");

-- CreateIndex
CREATE INDEX "live_items_live_session_id_idx" ON "live_items"("live_session_id");

-- AddForeignKey
ALTER TABLE "live_items" ADD CONSTRAINT "live_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_items" ADD CONSTRAINT "live_items_live_session_id_fkey" FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
