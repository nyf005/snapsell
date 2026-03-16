-- AlterTable: ajoute token_version pour révocation JWT
-- Valeur par défaut 0 — incrémenter pour invalider toutes les sessions actives d'un utilisateur
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
