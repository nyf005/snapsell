ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "whatsapp_template_name" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsapp_template_language" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsapp_template_category" TEXT;
