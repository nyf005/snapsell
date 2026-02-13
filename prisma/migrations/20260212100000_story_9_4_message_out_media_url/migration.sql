-- Story 9.4: Ajouter mediaUrl sur MessageOut pour MMS WhatsApp (photo article)
ALTER TABLE "messages_out" ADD COLUMN "media_url" TEXT;
