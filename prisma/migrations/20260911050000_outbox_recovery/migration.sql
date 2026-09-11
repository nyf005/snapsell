ALTER TABLE "messages_out"
  ADD COLUMN "published_at" TIMESTAMP(3),
  ADD COLUMN "publish_lease_until" TIMESTAMP(3),
  ADD COLUMN "send_lease_until" TIMESTAMP(3),
  ADD COLUMN "sent_at" TIMESTAMP(3);
CREATE INDEX "messages_out_status_published_at_created_at_idx"
  ON "messages_out"("status", "published_at", "created_at");
-- L'historique ne permet pas de reconstituer la date exacte d'envoi.
-- Les nouveaux envois remplissent sent_at ; aucun horodatage ancien n'est inventé.
