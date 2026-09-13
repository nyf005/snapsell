ALTER TABLE "tenants" ADD COLUMN "deposit_percent" INTEGER;
ALTER TABLE "orders" ADD COLUMN "deposit_amount_cents" INTEGER, ADD COLUMN "deposit_percent_snapshot" INTEGER, ADD COLUMN "items_total_cents" INTEGER;
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_deposit_percent_range" CHECK ("deposit_percent" IS NULL OR "deposit_percent" BETWEEN 1 AND 100);
ALTER TABLE "orders" ADD CONSTRAINT "orders_deposit_nonnegative" CHECK (("deposit_amount_cents" IS NULL OR "deposit_amount_cents" >= 0) AND ("items_total_cents" IS NULL OR "items_total_cents" >= 0));
