/**
 * Test d'intégration : quotas de sièges et de preuves.
 *
 * `checkAgentsQuota` compte les sièges occupés, puis l'appelant crée le membre.
 * Entre les deux, rien ne tient la place. Il n'y a pas de contrainte en base
 * pour rattraper — contrairement au numéro de commande, où l'unicité arbitre.
 * Deux invitations acceptées à la même seconde lisent donc le même compte et
 * passent toutes les deux : la boutique se retrouve avec un siège de plus que
 * ce qu'elle paie.
 *
 * Ce fichier vérifie l'invariant qui compte — **jamais plus de sièges occupés
 * que de sièges vendus** — et non le chemin suivi pour y arriver.
 *
 * ⚠️ Le test « deux acceptations simultanées » est écrit pour *constater*, pas
 * pour confirmer : si le TOCTOU est réel, il échoue, et c'est le résultat
 * recherché. Voir la note à l'intérieur.
 *
 * Nécessite DATABASE_URL.
 * Exécution : RUN_INTEGRATION_TESTS=true npx vitest run usage.integration
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("~/lib/logger", () => ({
  workerLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const shouldRun =
  process.env.RUN_INTEGRATION_TESTS === "true" && !!process.env.DATABASE_URL;

describe.skipIf(!shouldRun)("quotas — base réelle", () => {
  let db: typeof import("~/server/db").db;
  let checkAgentsQuota: typeof import("./usage").checkAgentsQuota;
  let checkProofsQuota: typeof import("./usage").checkProofsQuota;

  let tenantId: string;
  let seq = 0;

  beforeAll(async () => {
    db = (await import("~/server/db")).db;
    const mod = await import("./usage");
    checkAgentsQuota = mod.checkAgentsQuota;
    checkProofsQuota = mod.checkProofsQuota;

    const tenant = await db.tenant.create({
      data: { name: "Test Tenant Quotas", maxAgents: 2 },
    });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    if (!db || !tenantId) return;
    await db.user.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await db.user.deleteMany({ where: { tenantId } });
    await db.tenant.update({ where: { id: tenantId }, data: { maxAgents: 2 } });
  });

  /** Crée un membre. Le Propriétaire n'occupe pas de siège. */
  async function member(role: "OWNER" | "MANAGER" | "AGENT") {
    return db.user.create({
      data: {
        tenantId,
        email: `membre-${(seq += 1)}-${Date.now()}@example.com`,
        name: `Membre ${seq}`,
        role,
      },
    });
  }

  describe("sièges", () => {
    it("ne compte pas le Propriétaire", async () => {
      await member("OWNER");

      const quota = await checkAgentsQuota(tenantId);

      expect(quota.currentCount).toBe(0);
      expect(quota.allowed).toBe(true);
    });

    /**
     * La règle est « toute personne sauf le Propriétaire », pas une liste de
     * rôles : promouvoir un Agent en Manager ne doit pas libérer un siège.
     */
    it.each(["MANAGER", "AGENT"] as const)("compte un %s comme un siège", async (role) => {
      await member(role);

      expect((await checkAgentsQuota(tenantId)).currentCount).toBe(1);
    });

    it("refuse au-delà du nombre de sièges vendus", async () => {
      await member("AGENT");
      await member("MANAGER");

      const quota = await checkAgentsQuota(tenantId);

      expect(quota.currentCount).toBe(2);
      expect(quota.maxAgents).toBe(2);
      expect(quota.allowed).toBe(false);
    });

    /**
     * Le plan gratuit vend zéro siège (`maxAgents` vaut 0 par défaut). Aucune
     * équipe n'y est donc possible — c'est un choix commercial, pas un défaut,
     * mais il doit rester explicite.
     */
    it("n'autorise aucun membre quand le plan n'en vend aucun", async () => {
      await db.tenant.update({ where: { id: tenantId }, data: { maxAgents: 0 } });

      expect((await checkAgentsQuota(tenantId)).allowed).toBe(false);
    });

    /**
     * ⚠️ CE TEST EST UN CONSTAT, PAS UNE CONFIRMATION.
     *
     * Deux invitations acceptées à la même seconde. `checkAgentsQuota` lit le
     * compte, puis l'appelant crée l'utilisateur — et rien ne tient la place
     * entre les deux : pas de verrou, pas de contrainte unique sur le nombre de
     * membres. Les deux lectures voient un siège libre, les deux créations
     * aboutissent, et la boutique occupe trois sièges pour deux vendus.
     *
     * L'invariant testé est celui qui compte pour la facturation : le nombre de
     * sièges occupés ne doit jamais dépasser le nombre vendu. S'il échoue, le
     * correctif n'est pas dans le test : il faut sérialiser la vérification et
     * la création (transaction + `SELECT … FOR UPDATE` sur la ligne tenant,
     * comme le fait déjà `checkAndConsumeCredit`).
     */
    it("deux acceptations simultanées ne dépassent pas le nombre de sièges vendus", async () => {
      await member("AGENT"); // 1 siège occupé sur 2

      // Deux invitations acceptées en parallèle : chacune vérifie puis crée.
      await Promise.all(
        [1, 2].map(async () => {
          const quota = await checkAgentsQuota(tenantId);
          if (!quota.allowed) return;
          await member("AGENT");
        }),
      );

      const occupied = await db.user.count({
        where: { tenantId, role: { not: "OWNER" } },
      });
      const { maxAgents } = await db.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { maxAgents: true },
      });

      expect(occupied).toBeLessThanOrEqual(maxAgents);
    });
  });

  describe("preuves de paiement", () => {
    it("compte les preuves du cycle en cours", async () => {
      const quota = await checkProofsQuota(tenantId);

      expect(quota.currentUsage).toBe(0);
      expect(quota.allowed).toBe(true);
    });

    /** `-1` signifie illimité : le quota ne doit jamais bloquer dans ce cas. */
    it("laisse passer quand le plan est illimité", async () => {
      await db.tenant.update({
        where: { id: tenantId },
        data: { maxProofsPerMonth: -1 },
      });

      const quota = await checkProofsQuota(tenantId);

      expect(quota.allowed).toBe(true);

      await db.tenant.update({
        where: { id: tenantId },
        data: { maxProofsPerMonth: 20 },
      });
    });

    it("refuse une fois le plafond atteint", async () => {
      await db.tenant.update({
        where: { id: tenantId },
        data: { maxProofsPerMonth: 0 },
      });

      expect((await checkProofsQuota(tenantId)).allowed).toBe(false);

      await db.tenant.update({
        where: { id: tenantId },
        data: { maxProofsPerMonth: 20 },
      });
    });
  });
});
