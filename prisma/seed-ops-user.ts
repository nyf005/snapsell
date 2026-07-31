/**
 * Crée un utilisateur OPS (console ops multi-tenant, Story 7B.1).
 *
 * Usage :
 *   npx tsx prisma/seed-ops-user.ts
 *
 * Variables d'environnement, toutes **obligatoires** sauf OPS_NAME :
 *   OPS_EMAIL    – email du user ops
 *   OPS_PASSWORD – mot de passe, 12 caractères minimum
 *   OPS_NAME     – nom affiché (défaut: Ops SnapSell)
 *
 * Ce script portait des identifiants par défaut — ops@snapsell.com /
 * opspass123. Lancé sans variables contre la base de production, il créait donc
 * un compte à mot de passe connu, capable de lire les journaux de **toutes** les
 * boutiques. On les exige désormais explicitement : ce script se lance rarement,
 * et une commande un peu plus longue vaut mieux qu'une porte ouverte.
 *
 * Le user est créé avec role=OPS et tenantId=null.
 * Si l'email existe déjà, le script met à jour le rôle et supprime le tenant.
 */

// Charge .env, puis réutilise le client déjà configuré par l'application.
// Un `new PrismaClient()` nu ne fonctionne plus depuis Prisma 7, qui exige un
// adaptateur de pilote : le script échouait au chargement, avant même d'avoir
// lu ses arguments. Il n'existait donc plus aucun moyen de créer un compte OPS.
import "../scripts/runtime-env";
import { hash } from "bcrypt";

import { db } from "~/server/db";

async function main() {
  const email = process.env.OPS_EMAIL;
  const password = process.env.OPS_PASSWORD;
  const name = process.env.OPS_NAME ?? "Ops SnapSell";

  if (!email || !password) {
    console.error(
      "❌ OPS_EMAIL et OPS_PASSWORD sont requis.\n\n" +
        "   OPS_EMAIL=vous@exemple.com OPS_PASSWORD='<mot de passe fort>' \\\n" +
        "     npx tsx prisma/seed-ops-user.ts",
    );
    process.exit(1);
  }

  // Ce compte lit les journaux de toutes les boutiques : un mot de passe court
  // n'a pas sa place ici.
  if (password.length < 12) {
    console.error("❌ OPS_PASSWORD doit faire au moins 12 caractères.");
    process.exit(1);
  }

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
  // Le mot de passe n'est pas réaffiché : il vient de l'appelant, qui le
  // connaît déjà, et cette sortie finit souvent dans un historique de terminal.
  console.log(`\n🌐 Se connecter sur /login puis aller sur /ops/logs`);
}

main()
  .catch((e) => {
    console.error("❌ Erreur :", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
