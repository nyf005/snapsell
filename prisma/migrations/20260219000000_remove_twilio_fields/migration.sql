-- Migration: remove_twilio_fields
-- Story 10.6: Supprimer le champ whatsappPhoneNumber du model Tenant

-- Drop unique index on whatsapp_phone_number
DROP INDEX "Tenant_whatsapp_phone_number_key";

-- Drop the column
ALTER TABLE "Tenant" DROP COLUMN "whatsapp_phone_number";
