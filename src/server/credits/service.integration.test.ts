/**
 * Test d'intégration : consommation de crédits sous concurrence.
 *
 * Le worker tourne en `localConcurrency: 5`. Deux messages rapprochés d'un même
 * client sont donc traités en parallèle. Avant le verrou `FOR UPDATE` sur la ligne
 * tenant, les deux passaient le check « fenêtre active », lisaient le même solde et
 * décrémentaient chacun un crédit → double facturation et solde négatif possible.
 *
 * Ces tests vérifient qu'un seul crédit est consommé et qu'une seule fenêtre est créée.
 *
 * Nécessite DATABASE_URL (le verrou est une garantie Postgres, non simulable en mock).
 * Exécution : RUN_INTEGRATION_TESTS=true npm test -- service.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("~/lib/logger", () => ({
  workerLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Chaque test enchaîne des allers-retours vers une base distante ; le défaut
// de 5 s de Vitest est calibré pour des tests en mémoire.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const shouldRun = process.env.RUN_INTEGRATION_TESTS === "true" && !!process.env.DATABASE_URL;

describe.skipIf(!shouldRun)("checkAndConsumeCredit — concurrence", () => {
  let db: typeof import("~/server/db").db;
  let checkAndConsumeCredit: typeof import("./service").checkAndConsumeCredit;
  let cleanupExpiredWindows: typeof import("./service").cleanupExpiredWindows;
  let testTenantId: string;

  beforeAll(async () => {
    db = (await import("~/server/db")).db;
    const svc = await import("./service");
    checkAndConsumeCredit = svc.checkAndConsumeCredit;
    cleanupExpiredWindows = svc.cleanupExpiredWindows;

    const tenant = await db.tenant.create({
      data: { name: "Test Tenant Credits Concurrency" },
    });
    testTenantId = tenant.id;
  });

  afterAll(async () => {
    if (!db || !testTenantId) return;
    await db.conversationWindow.deleteMany({ where: { tenantId: testTenantId } });
    await db.tenant.delete({ where: { id: testTenantId } });
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await db.conversationWindow.deleteMany({ where: { tenantId: testTenantId } });
    await db.tenant.update({
      where: { id: testTenantId },
      data: { creditsBalance: 10, creditsBonus: 0 },
    });
  });

  it("5 appels concurrents pour le même client ne consomment qu'UN crédit", async () => {
    const phone = `+3360000${Date.now() % 10000}`;

    const results = await Promise.all(
      Array.from({ length: 5 }, () => checkAndConsumeCredit(testTenantId, phone)),
    );

    // Tous autorisés
    expect(results.every((r) => r.allowed)).toBe(true);

    // Exactement un seul a ouvert la session
    const newSessions = results.filter((r) => r.allowed && r.isNewSession);
    expect(newSessions).toHaveLength(1);

    // Une seule fenêtre en base
    const windows = await db.conversationWindow.count({
      where: { tenantId: testTenantId, customerPhone: phone },
    });
    expect(windows).toBe(1);

    // Un seul crédit débité
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: testTenantId } });
    expect(tenant.creditsBalance).toBe(9);
  });

  it("des clients différents consomment bien un crédit chacun", async () => {
    const phones = Array.from({ length: 3 }, (_, i) => `+336111${Date.now() % 1000}${i}`);

    await Promise.all(phones.map((p) => checkAndConsumeCredit(testTenantId, p)));

    const windows = await db.conversationWindow.count({ where: { tenantId: testTenantId } });
    expect(windows).toBe(3);

    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: testTenantId } });
    expect(tenant.creditsBalance).toBe(7);
  });

  it("le solde ne peut pas devenir négatif sous concurrence", async () => {
    await db.tenant.update({
      where: { id: testTenantId },
      data: { creditsBalance: 1, creditsBonus: 0 },
    });

    // 4 clients distincts se présentent en même temps avec 1 seul crédit disponible
    const phones = Array.from({ length: 4 }, (_, i) => `+336222${Date.now() % 1000}${i}`);
    const results = await Promise.all(
      phones.map((p) => checkAndConsumeCredit(testTenantId, p)),
    );

    const allowed = results.filter((r) => r.allowed);
    const refused = results.filter((r) => !r.allowed);

    expect(allowed).toHaveLength(1);
    expect(refused).toHaveLength(3);
    expect(refused.every((r) => !r.allowed && r.reason === "no_credits")).toBe(true);

    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: testTenantId } });
    expect(tenant.creditsBalance).toBe(0);
    expect(tenant.creditsBalance).toBeGreaterThanOrEqual(0);
  });

  it("une session active ne reconsomme pas de crédit", async () => {
    const phone = `+336333${Date.now() % 10000}`;

    const first = await checkAndConsumeCredit(testTenantId, phone);
    expect(first.allowed && first.isNewSession).toBe(true);

    const second = await checkAndConsumeCredit(testTenantId, phone);
    expect(second.allowed && !second.isNewSession).toBe(true);

    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: testTenantId } });
    expect(tenant.creditsBalance).toBe(9);
  });

  it("bascule sur creditsBonus quand le solde mensuel est épuisé", async () => {
    await db.tenant.update({
      where: { id: testTenantId },
      data: { creditsBalance: 0, creditsBonus: 2 },
    });

    const phone = `+336444${Date.now() % 10000}`;
    const result = await checkAndConsumeCredit(testTenantId, phone);

    expect(result.allowed).toBe(true);
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: testTenantId } });
    expect(tenant.creditsBalance).toBe(0);
    expect(tenant.creditsBonus).toBe(1);
  });

  it("cleanupExpiredWindows supprime les fenêtres échues et garde les actives", async () => {
    await db.conversationWindow.createMany({
      data: [
        {
          tenantId: testTenantId,
          customerPhone: "+336999001",
          expiresAt: new Date(Date.now() - 60_000),
        },
        {
          tenantId: testTenantId,
          customerPhone: "+336999002",
          expiresAt: new Date(Date.now() - 3_600_000),
        },
        {
          tenantId: testTenantId,
          customerPhone: "+336999003",
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      ],
    });

    const deleted = await cleanupExpiredWindows(testTenantId);
    expect(deleted).toBe(2);

    const remaining = await db.conversationWindow.findMany({
      where: { tenantId: testTenantId },
    });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.customerPhone).toBe("+336999003");
  });
});
