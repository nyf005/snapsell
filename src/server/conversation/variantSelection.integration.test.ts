/**
 * Test d'intégration : sélection de variante sous concurrence.
 *
 * `handleVariantChoice` fait un read-modify-write sur `metadata`, un blob JSON réécrit
 * en entier. Le worker tourne en `localConcurrency: 5` : deux réponses rapprochées de
 * la même cliente peuvent donc être traitées en parallèle.
 *
 * Avant le verrou `FOR UPDATE` sur `conversation_states`, les deux jobs lisaient le même
 * `currentDimensionIndex` et la dernière écriture écrasait le choix de l'autre — une
 * dimension perdue, la question reposée, voire une réservation sur la mauvaise variante.
 *
 * Nécessite DATABASE_URL (le verrou est une garantie Postgres, non simulable en mock).
 * Exécution : RUN_INTEGRATION_TESTS=true npm test -- variantSelection.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("~/lib/logger", () => ({
  workerLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// L'envoi sortant n'est pas le sujet : on l'isole pour ne tester que la machine à états.
vi.mock("~/server/messaging/outbox", () => ({
  writeToOutbox: vi.fn().mockResolvedValue({ id: "msg-mock" }),
}));

vi.mock("~/server/reservation/service", () => ({
  createReservation: vi.fn().mockResolvedValue({ success: true }),
}));

// Chaque test enchaîne des allers-retours vers une base distante ; le défaut
// de 5 s de Vitest est calibré pour des tests en mémoire.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const shouldRun = process.env.RUN_INTEGRATION_TESTS === "true" && !!process.env.DATABASE_URL;

describe.skipIf(!shouldRun)("handleVariantChoice — concurrence", () => {
  let db: typeof import("~/server/db").db;
  let handleVariantChoice: typeof import("./variantSelection").handleVariantChoice;
  let VARIANT_SELECTION_STATE: typeof import("./variantSelection").VARIANT_SELECTION_STATE;
  let testTenantId: string;

  const phone = "+33699000111";

  beforeAll(async () => {
    db = (await import("~/server/db")).db;
    const mod = await import("./variantSelection");
    handleVariantChoice = mod.handleVariantChoice;
    VARIANT_SELECTION_STATE = mod.VARIANT_SELECTION_STATE;

    const tenant = await db.tenant.create({ data: { name: "Test Tenant VariantSelection" } });
    testTenantId = tenant.id;
  });

  afterAll(async () => {
    if (!db || !testTenantId) return;
    await db.conversationState.deleteMany({ where: { tenantId: testTenantId } });
    await db.tenant.delete({ where: { id: testTenantId } });
  });

  /** Positionne un état « en cours de choix » sur 3 dimensions, index 0. */
  async function seedState() {
    await db.conversationState.deleteMany({ where: { tenantId: testTenantId, phone } });
    await db.conversationState.create({
      data: {
        tenantId: testTenantId,
        phone,
        state: VARIANT_SELECTION_STATE.CHOOSING_DIMENSION,
        metadata: {
          itemId: "item-test",
          code: "A12",
          quantity: 1,
          liveSessionId: null,
          dimensions: ["Couleur", "Taille", "Matiere"],
          selections: {},
          currentDimensionIndex: 0,
        },
      },
    });
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    await seedState();
  });

  it("deux réponses concurrentes enregistrent bien DEUX dimensions (aucune perdue)", async () => {
    await Promise.all([
      handleVariantChoice(testTenantId, phone, "Bleu", "corr-a"),
      handleVariantChoice(testTenantId, phone, "Rouge", "corr-b"),
    ]);

    const conv = await db.conversationState.findUniqueOrThrow({
      where: { tenantId_phone: { tenantId: testTenantId, phone } },
    });
    const metadata = conv.metadata as unknown as {
      currentDimensionIndex: number;
      selections: Record<string, string>;
    };

    // Sans verrou, les deux lisaient index=0 et écrivaient index=1 chacun avec leur
    // propre choix : une seule sélection survivait mais l'index n'avançait que d'un cran,
    // laissant la machine à états incohérente. Avec verrou, les deux appels sont
    // sérialisés : deux dimensions sont réellement enregistrées.
    expect(metadata.currentDimensionIndex).toBe(2);
    expect(Object.keys(metadata.selections)).toHaveLength(2);
    expect(metadata.selections.Couleur).toBeDefined();
    expect(metadata.selections.Taille).toBeDefined();
  });

  it("les choix séquentiels s'accumulent correctement", async () => {
    await handleVariantChoice(testTenantId, phone, "Bleu", "corr-1");
    await handleVariantChoice(testTenantId, phone, "M", "corr-2");

    const conv = await db.conversationState.findUniqueOrThrow({
      where: { tenantId_phone: { tenantId: testTenantId, phone } },
    });
    const metadata = conv.metadata as unknown as {
      currentDimensionIndex: number;
      selections: Record<string, string>;
    };

    expect(metadata.currentDimensionIndex).toBe(2);
    expect(metadata.selections).toMatchObject({ Couleur: "Bleu", Taille: "M" });
  });

  it("ignore un choix quand aucun état de sélection n'est actif", async () => {
    await db.conversationState.deleteMany({ where: { tenantId: testTenantId, phone } });

    await expect(
      handleVariantChoice(testTenantId, phone, "Bleu", "corr-x"),
    ).resolves.toBeUndefined();

    const count = await db.conversationState.count({
      where: { tenantId: testTenantId, phone },
    });
    expect(count).toBe(0);
  });

  it("ignore un choix quand l'état n'est plus CHOOSING_DIMENSION", async () => {
    await db.conversationState.update({
      where: { tenantId_phone: { tenantId: testTenantId, phone } },
      data: { state: VARIANT_SELECTION_STATE.COMPLETED },
    });

    await handleVariantChoice(testTenantId, phone, "Bleu", "corr-y");

    const conv = await db.conversationState.findUniqueOrThrow({
      where: { tenantId_phone: { tenantId: testTenantId, phone } },
    });
    const metadata = conv.metadata as unknown as { currentDimensionIndex: number };

    // Aucune mutation : le garde-fou empêche un job concurrent de reprendre un flux terminé.
    expect(metadata.currentDimensionIndex).toBe(0);
  });
});
