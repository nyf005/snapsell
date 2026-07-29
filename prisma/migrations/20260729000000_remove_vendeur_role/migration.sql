-- Suppression du rôle VENDEUR de l'enum Role.
--
-- Aucun contrôle de permission du code ne le distinguait d'AGENT : tous testent
-- canManageGrid, isOpsUser, ou si la cible est OWNER. Deux étiquettes pour un seul
-- accès réel, et une copie qui laissait croire à une cloison inexistante.
-- Voir ASSIGNABLE_ROLES dans src/lib/rbac.ts.

-- 1. Convertir les lignes existantes. Un membre VENDEUR ne perd aucun accès :
--    il voyait déjà exactement ce que voit un AGENT.
UPDATE "users" SET "role" = 'AGENT' WHERE "role" = 'VENDEUR';
UPDATE "invitations" SET "role" = 'AGENT' WHERE "role" = 'VENDEUR';

-- 2. Postgres n'a pas de DROP VALUE sur un type enum : il faut le recréer.
--    Les defaults doivent tomber le temps du changement de type, sinon Postgres
--    refuse la conversion de colonne.
ALTER TYPE "Role" RENAME TO "Role_old";

CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'AGENT', 'OPS');

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'OWNER';

ALTER TABLE "invitations" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "invitations" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
ALTER TABLE "invitations" ALTER COLUMN "role" SET DEFAULT 'AGENT';

DROP TYPE "Role_old";
