-- CreateTable
CREATE TABLE "waitlist" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "live_session_id" TEXT NOT NULL,
    "live_item_id" TEXT NOT NULL,
    "client_phone" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_tenant_id_live_session_id_client_phone_live_item__key" ON "waitlist"("tenant_id", "live_session_id", "client_phone", "live_item_id");

-- CreateIndex
CREATE INDEX "waitlist_tenant_id_live_session_id_live_item_id_idx" ON "waitlist"("tenant_id", "live_session_id", "live_item_id");

-- CreateIndex
CREATE INDEX "waitlist_live_item_id_live_session_id_idx" ON "waitlist"("live_item_id", "live_session_id");

-- CreateIndex (Story 4.3: premier en file par live_item + session)
CREATE INDEX "reservations_live_item_id_live_session_id_idx" ON "reservations"("live_item_id", "live_session_id");

-- AddForeignKey
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
