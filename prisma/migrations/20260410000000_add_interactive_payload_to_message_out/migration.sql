-- AlterTable: add interactive_payload column to messages_out
ALTER TABLE "messages_out" ADD COLUMN "interactive_payload" JSONB;
