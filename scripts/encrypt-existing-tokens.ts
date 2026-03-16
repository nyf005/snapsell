#!/usr/bin/env tsx
/**
 * Migration one-shot : chiffre les metaAccessToken en clair déjà stockés en base.
 *
 * À exécuter UNE SEULE FOIS après avoir défini ENCRYPTION_KEY dans les variables d'env.
 *
 * Usage:
 *   ENCRYPTION_KEY=<64-hex-chars> tsx scripts/encrypt-existing-tokens.ts
 *
 * Prérequis:
 *   - ENCRYPTION_KEY configurée (64 chars hex)
 *   - DATABASE_URL configurée (connexion directe Neon, non-pooler)
 *
 * Sécurité:
 *   - Les tokens déjà préfixés "enc:" sont ignorés (idempotent)
 *   - Lancer en dehors des heures de pointe
 *   - Vérifier les logs avant de confirmer le succès
 */

import "./runtime-env";

import { db } from "~/server/db";
import { encrypt, isEncrypted } from "~/lib/crypto";

async function main(): Promise<void> {
  console.log("=== Migration: chiffrement des metaAccessToken ===\n");

  if (!process.env.ENCRYPTION_KEY) {
    console.error("ERREUR: ENCRYPTION_KEY manquante. Définir avant de lancer la migration.");
    process.exit(1);
  }

  const tenants = await db.tenant.findMany({
    where: { metaAccessToken: { not: null } },
    select: { id: true, name: true, metaAccessToken: true },
  });

  console.log(`Tenants avec un accessToken: ${tenants.length}\n`);

  let skipped = 0;
  let encrypted = 0;
  let errors = 0;

  for (const tenant of tenants) {
    if (!tenant.metaAccessToken) continue;

    if (isEncrypted(tenant.metaAccessToken)) {
      console.log(`[SKIP] Tenant ${tenant.id} (${tenant.name}): déjà chiffré`);
      skipped++;
      continue;
    }

    try {
      const encryptedToken = encrypt(tenant.metaAccessToken);
      await db.tenant.update({
        where: { id: tenant.id },
        data: { metaAccessToken: encryptedToken },
      });
      console.log(`[OK]   Tenant ${tenant.id} (${tenant.name}): chiffré avec succès`);
      encrypted++;
    } catch (err) {
      console.error(`[ERR]  Tenant ${tenant.id} (${tenant.name}): échec — ${String(err)}`);
      errors++;
    }
  }

  console.log(`\n=== Résultat ===`);
  console.log(`  Chiffrés:  ${encrypted}`);
  console.log(`  Ignorés:   ${skipped}`);
  console.log(`  Erreurs:   ${errors}`);

  if (errors > 0) {
    console.error("\nDes erreurs sont survenues. Vérifier les logs et relancer.");
    process.exit(1);
  }

  console.log("\nMigration terminée avec succès.");
  process.exit(0);
}

void main().catch((err) => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
