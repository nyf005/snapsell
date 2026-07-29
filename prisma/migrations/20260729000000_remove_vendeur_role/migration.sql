-- Suppression du rôle VENDEUR de l'enum Role.
--
-- Aucun contrôle de permission du code ne le distinguait d'AGENT : tous testent
-- canManageGrid, isOpsUser, ou si la cible est OWNER. Deux étiquettes pour un seul
-- accès réel, et une copie qui laissait croire à une cloison inexistante.
-- Voir ASSIGNABLE_ROLES dans src/lib/rbac.ts.

BEGIN;

-- 1. Convertir les lignes existantes AVANT le changement de type.
--    Prisma ne génère pas ces deux UPDATE : son cast `role::text::Role_new`
--    échouerait sur une ligne VENDEUR. Un membre concerné ne perd aucun accès,
--    il voyait déjà exactement ce que voit un AGENT.
UPDATE "users" SET "role" = 'AGENT' WHERE "role" = 'VENDEUR';
UPDATE "invitations" SET "role" = 'AGENT' WHERE "role" = 'VENDEUR';

-- 2. Postgres n'a pas de DROP VALUE sur un type enum : il faut le recréer.
--    On crée le nouveau type d'abord et on renomme à la fin — l'inverse laisserait
--    une fenêtre sans type "Role" valide. Les defaults doivent tomber le temps de
--    la conversion, sinon Postgres refuse le changement de colonne.
CREATE TYPE "Role_new" AS ENUM ('OWNER', 'MANAGER', 'AGENT', 'OPS');

ALTER TABLE "public"."invitations" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "public"."users" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "invitations" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");

ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";

ALTER TABLE "invitations" ALTER COLUMN "role" SET DEFAULT 'AGENT';
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'OWNER';

COMMIT;
