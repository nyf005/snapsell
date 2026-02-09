-- Story 7A.2: Subscription + Entitlements + SubscriptionPayment

-- Subscription fields on Tenant
ALTER TABLE "tenants" ADD COLUMN "subscription_plan" TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "tenants" ADD COLUMN "subscription_status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "tenants" ADD COLUMN "subscription_expires_at" TIMESTAMP(3);
ALTER TABLE "tenants" ADD COLUMN "cycle_started_at" TIMESTAMP(3);

-- Paystack references
ALTER TABLE "tenants" ADD COLUMN "paystack_customer_code" TEXT;
ALTER TABLE "tenants" ADD COLUMN "paystack_subscription_code" TEXT;
ALTER TABLE "tenants" ADD COLUMN "paystack_email_token" TEXT;
ALTER TABLE "tenants" ADD COLUMN "paystack_authorization_code" TEXT;

-- Entitlements — quotas numériques
ALTER TABLE "tenants" ADD COLUMN "max_confirmed_orders_per_month" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "tenants" ADD COLUMN "max_proofs_per_month" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "tenants" ADD COLUMN "max_agents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tenants" ADD COLUMN "overage_per_order_cents" INTEGER NOT NULL DEFAULT 0;

-- Entitlements — feature flags
ALTER TABLE "tenants" ADD COLUMN "has_export_csv" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN "has_advanced_exports" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN "has_notifications_outside_24h" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN "has_deposit_recommended" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN "has_advanced_filters" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN "has_priority_support" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN "show_branding" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "tenants" ADD COLUMN "show_upgrade_banner" BOOLEAN NOT NULL DEFAULT true;

-- Unique constraints for Paystack codes
CREATE UNIQUE INDEX "tenants_paystack_customer_code_key" ON "tenants"("paystack_customer_code");
CREATE UNIQUE INDEX "tenants_paystack_subscription_code_key" ON "tenants"("paystack_subscription_code");

-- SubscriptionPayment model
CREATE TABLE "subscription_payments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "paystack_reference" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "plan" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "status" TEXT NOT NULL,
    "channel" TEXT,
    "card_last4" TEXT,
    "overage_details" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- Indexes on subscription_payments
CREATE UNIQUE INDEX "subscription_payments_paystack_reference_key" ON "subscription_payments"("paystack_reference");
CREATE INDEX "subscription_payments_tenant_id_idx" ON "subscription_payments"("tenant_id");
CREATE INDEX "subscription_payments_tenant_id_type_status_idx" ON "subscription_payments"("tenant_id", "type", "status");

-- Foreign key
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
