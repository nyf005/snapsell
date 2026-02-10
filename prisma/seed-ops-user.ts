/**
 * Crée un utilisateur OPS (console ops multi-tenant, Story 7B.1).
 *
 * Usage :
 *   npx tsx prisma/seed-ops-user.ts
 *
 * Variables d'environnement (ou valeurs par défaut) :
 *   OPS_EMAIL    – email du user ops (défaut: ops@snapsell.com)
 *   OPS_PASSWORD – mot de passe (défaut: opspass123)
 *   OPS_NAME     – nom affiché (défaut: Ops SnapSell)
 *
 * Le user est créé avec role=OPS et tenantId=null.
 * Si l'email existe déjà, le script met à jour le rôle et supprime le tenant.
 */

import { PrismaClient } from "../generated/prisma";
import { hash } from "bcrypt";

const db = new PrismaClient();

async function main() {
  const email = process.env.OPS_EMAIL ?? "ops@snapsell.com";
  const password = process.env.OPS_PASSWORD ?? "opspass123";
  const name = process.env.OPS_NAME ?? "Ops SnapSell";

  const passwordHash = await hash(password, 10);

  const user = await db.user.upsert({
    where: { email },
    update: {
      role: "OPS",
      tenantId: null,
      passwordHash,
      name,
    },
    create: {
      email,
      passwordHash,
      name,
      role: "OPS",
      tenantId: null,
    },
  });

  console.log(`✅ User OPS créé/mis à jour :`);
  console.log(`   id:       ${user.id}`);
  console.log(`   email:    ${user.email}`);
  console.log(`   name:     ${user.name}`);
  console.log(`   role:     ${user.role}`);
  console.log(`   tenantId: ${user.tenantId ?? "null (correct pour OPS)"}`);
  console.log(`\n🔑 Mot de passe : ${password}`);
  console.log(`\n🌐 Se connecter sur /login puis aller sur /ops/logs`);
}

main()
  .catch((e) => {
    console.error("❌ Erreur :", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
