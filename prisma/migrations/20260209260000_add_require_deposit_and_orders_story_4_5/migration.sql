-- Story 4.5: Tenant requireDeposit (acompte activé) + Order (commande à la confirmation)
ALTER TABLE "tenants" ADD COLUMN "require_deposit" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('confirmed', 'confirmed_pending_deposit', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('no_deposit', 'deposit_pending', 'deposit_approved', 'deposit_rejected');

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "deposit_status" "DepositStatus" NOT NULL,
    "deposit_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_reservation_id_key" ON "orders"("reservation_id");

-- CreateIndex
CREATE INDEX "orders_tenant_id_idx" ON "orders"("tenant_id");

-- CreateIndex
CREATE INDEX "orders_reservation_id_idx" ON "orders"("reservation_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
