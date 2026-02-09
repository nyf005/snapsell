-- Story 4.4: Rappel T-2 min — une seule fois par réservation
ALTER TABLE "reservations" ADD COLUMN "reminder_sent_at" TIMESTAMP(3);
