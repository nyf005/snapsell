-- CreateTable
CREATE TABLE "category_prices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "category_letter" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "category_prices_tenant_id_category_letter_key" ON "category_prices"("tenant_id", "category_letter");

-- CreateIndex
CREATE INDEX "category_prices_tenant_id_idx" ON "category_prices"("tenant_id");

-- AddForeignKey
ALTER TABLE "category_prices" ADD CONSTRAINT "category_prices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
