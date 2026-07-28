/**
 * Test d'intégration : renouvellement mensuel des crédits.
 *
 * Ce job touche à de l'état de facturation (solde de crédits, avancement du cycle).
 * Les cas délicats couverts ici :
 *   - un tenant dont l'échéance est passée est rechargé selon son plan COURANT ;
 *   - `creditsBonus` (crédits achetés) n'est JAMAIS réinitialisé ;
 *   - un tenant sans cycle amorcé (`usageResetDate` null, cas de tous les comptes
 *     créés avant le 2026-07-28) est initialisé SANS recharge — sinon le premier
 *     passage du cron offrirait un cycle entier à toute la base ;
 *   - les cycles manqués sont rattrapés sans dérive si le job a pris du retard ;
 *   - un plan inconnu ne fait pas échouer tout le job.
 *
 * Nécessite DATABASE_URL.
 * Exécution : RUN_INTEGRATION_TESTS=true npm test -- credits-monthly-reset.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("~/lib/logger", () => ({
  workerLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const shouldRun = process.env.RUN_INTEGRATION_TESTS === "true" && !!process.env.DATABASE_URL;

describe.skipIf(!shouldRun)("runCreditsMonthlyResetJob", () => {
  let db: typeof import("~/server/db").db;
  let runCreditsMonthlyResetJob: typeof import("./credits-monthly-reset").runCreditsMonthlyResetJob;

  /** Tenants créés par ce fichier, pour un nettoyage ciblé. */
  const createdTenantIds: string[] = [];

  function daysFromNow(n: number): Date {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
  }

  async function makeTenant(data: {
    plan?: string;
    creditsBalance?: number;
    creditsTotalMonthly?: number;
    creditsBonus?: number;
    usageResetDate?: Date | null;
    cycleStartedAt?: Date | null;
    lowCreditsAlerted?: boolean;
  }) {
    const tenant = await db.tenant.create({
      data: {
        name: `Test CreditsReset ${Math.random().toString(36).slice(2, 10)}`,
        subscriptionPlan: data.plan ?? "starter",
        creditsBalance: data.creditsBalance ?? 0,
        creditsTotalMonthly: data.creditsTotalMonthly ?? 500,
        creditsBonus: data.creditsBonus ?? 0,
        usageResetDate: data.usageResetDate ?? null,
        cycleStartedAt: data.cycleStartedAt ?? null,
        lowCreditsAlerted: data.lowCreditsAlerted ?? false,
      },
    });
    createdTenantIds.push(tenant.id);
    return tenant;
  }

  beforeAll(async () => {
    db = (await import("~/server/db")).db;
    runCreditsMonthlyResetJob = (await import("./credits-monthly-reset"))
      .runCreditsMonthlyResetJob;
  });

  afterAll(async () => {
    if (!db || createdTenantIds.length === 0) return;
    await db.conversationWindow.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await db.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recharge un tenant dont l'échéance est passée, selon son plan courant", async () => {
    const tenant = await makeTenant({
      plan: "starter",
      creditsBalance: 12,
      creditsTotalMonthly: 500,
      usageResetDate: daysFromNow(-1),
    });

    await runCreditsMonthlyResetJob();

    const after = await db.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
    expect(after.creditsBalance).toBe(500);
    expect(after.creditsTotalMonthly).toBe(500);
    expect(after.usageResetDate!.getTime()).toBeGreaterThan(Date.now());
    expect(after.cycleStartedAt).not.toBeNull();
    expect(after.lowCreditsAlerted).toBe(false);
  });

  it("réarme l'alerte de crédits bas au renouvellement", async () => {
    const tenant = await makeTenant({
      creditsBalance: 3,
      usageResetDate: daysFromNow(-1),
      lowCreditsAlerted: true,
    });

    await runCreditsMonthlyResetJob();

    const after = await db.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
    expect(after.lowCreditsAlerted).toBe(false);
  });

  it("ne réinitialise JAMAIS les crédits achetés (creditsBonus)", async () => {
    const tenant = await makeTenant({
      creditsBalance: 0,
      creditsBonus: 250,
      usageResetDate: daysFromNow(-1),
    });

    await runCreditsMonthlyResetJob();

    const after = await db.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
    expect(after.creditsBalance).toBe(500); // forfait rechargé
    expect(after.creditsBonus).toBe(250); // packs achetés reportés
  });

  it("laisse intact un tenant dont l'échéance est future", async () => {
    const future = daysFromNow(10);
    const tenant = await makeTenant({
      creditsBalance: 42,
      usageResetDate: future,
    });

    await runCreditsMonthlyResetJob();

    const after = await db.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
    expect(after.creditsBalance).toBe(42);
    expect(after.usageResetDate!.getTime()).toBe(future.getTime());
  });

  it("amorce un cycle jamais initialisé SANS recharger les crédits", async () => {
    // Cas de tous les comptes créés avant le 2026-07-28 : usageResetDate null.
    // cycleStartedAt récent ⇒ l'échéance déduite est dans le futur.
    const tenant = await makeTenant({
      creditsBalance: 37,
      usageResetDate: null,
      cycleStartedAt: daysFromNow(-3),
    });

    const result = await runCreditsMonthlyResetJob();

    const after = await db.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
    // Le point critique : le solde ne doit PAS avoir été remis à 500,
    // sinon le premier passage du cron offrirait un cycle entier à toute la base.
    expect(after.creditsBalance).toBe(37);
    expect(after.usageResetDate).not.toBeNull();
    expect(after.usageResetDate!.getTime()).toBeGreaterThan(Date.now());
    expect(result.tenantsInitialized).toBeGreaterThanOrEqual(1);
  });

  it("recharge un cycle non amorcé dont l'échéance déduite est déjà dépassée", async () => {
    const tenant = await makeTenant({
      creditsBalance: 5,
      usageResetDate: null,
      cycleStartedAt: daysFromNow(-70), // +1 mois ⇒ échéance passée
    });

    await runCreditsMonthlyResetJob();

    const after = await db.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
    expect(after.creditsBalance).toBe(500);
    expect(after.usageResetDate!.getTime()).toBeGreaterThan(Date.now());
  });

  it("rattrape les cycles manqués sans dérive quand le job a pris du retard", async () => {
    const tenant = await makeTenant({
      creditsBalance: 0,
      usageResetDate: daysFromNow(-95), // ~3 cycles manqués
    });

    await runCreditsMonthlyResetJob();

    const after = await db.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
    // La nouvelle échéance repart de l'ancienne (+ n mois) et non de `now` :
    // elle est future, mais reste à moins d'un mois.
    const inOneMonth = new Date();
    inOneMonth.setMonth(inOneMonth.getMonth() + 1);
    expect(after.usageResetDate!.getTime()).toBeGreaterThan(Date.now());
    expect(after.usageResetDate!.getTime()).toBeLessThanOrEqual(inOneMonth.getTime());
  });

  it("ignore un tenant au plan inconnu sans faire échouer le job", async () => {
    const broken = await makeTenant({
      plan: "plan-inexistant",
      creditsBalance: 7,
      usageResetDate: daysFromNow(-1),
    });
    const healthy = await makeTenant({
      plan: "pro",
      creditsBalance: 1,
      creditsTotalMonthly: 1500,
      usageResetDate: daysFromNow(-1),
    });

    await expect(runCreditsMonthlyResetJob()).resolves.toBeDefined();

    const brokenAfter = await db.tenant.findUniqueOrThrow({ where: { id: broken.id } });
    const healthyAfter = await db.tenant.findUniqueOrThrow({ where: { id: healthy.id } });

    expect(brokenAfter.creditsBalance).toBe(7); // intact
    expect(healthyAfter.creditsBalance).toBe(1500); // traité malgré le voisin cassé
  });

  it("purge les fenêtres de conversation échues", async () => {
    const tenant = await makeTenant({ usageResetDate: daysFromNow(10) });
    await db.conversationWindow.createMany({
      data: [
        {
          tenantId: tenant.id,
          customerPhone: "+336900001",
          expiresAt: new Date(Date.now() - 60_000),
        },
        {
          tenantId: tenant.id,
          customerPhone: "+336900002",
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      ],
    });

    await runCreditsMonthlyResetJob();

    const remaining = await db.conversationWindow.findMany({
      where: { tenantId: tenant.id },
    });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.customerPhone).toBe("+336900002");
  });
});
