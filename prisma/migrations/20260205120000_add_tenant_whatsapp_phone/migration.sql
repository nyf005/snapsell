-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "whatsapp_phone_number" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "tenants_whatsapp_phone_number_key" ON "tenants"("whatsapp_phone_number");
