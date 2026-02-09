-- Story 4.1: Reservation model (tenant, session, client, item, status, address)
CREATE TYPE "ReservationStatus" AS ENUM ('reserved', 'address_collected', 'confirmed', 'expired');

CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "live_session_id" TEXT NOT NULL,
    "live_item_id" TEXT NOT NULL,
    "client_phone" TEXT NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'reserved',
    "address" TEXT,
    "expires_at" TIMESTAMP(3),
    "correlation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reservations_tenant_id_live_session_id_client_phone_live_item_id_key" ON "reservations"("tenant_id", "live_session_id", "client_phone", "live_item_id");
CREATE INDEX "reservations_tenant_id_live_session_id_client_phone_idx" ON "reservations"("tenant_id", "live_session_id", "client_phone");
CREATE INDEX "reservations_tenant_id_idx" ON "reservations"("tenant_id");

ALTER TABLE "reservations" ADD CONSTRAINT "reservations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_live_session_id_fkey" FOREIGN KEY ("live_session_id") REFERENCES "live_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_live_item_id_fkey" FOREIGN KEY ("live_item_id") REFERENCES "live_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
