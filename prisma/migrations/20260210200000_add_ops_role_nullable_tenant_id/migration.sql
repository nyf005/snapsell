-- Story 7B.1: Ajout rôle OPS et tenantId nullable pour users ops multi-tenant.
-- Un user OPS a role=OPS et tenant_id=NULL (mutuellement exclusif avec les rôles tenant).

-- AlterEnum: ajouter OPS à l'enum Role
ALTER TYPE "Role" ADD VALUE 'OPS';

-- AlterTable: rendre tenant_id nullable sur users (NULL pour les OPS)
ALTER TABLE "users" ALTER COLUMN "tenant_id" DROP NOT NULL;
