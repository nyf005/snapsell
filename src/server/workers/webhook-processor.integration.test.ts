/**
 * Tests d'intégration pour le worker webhook-processor (pg-boss)
 *
 * Ces tests vérifient que le worker fonctionne correctement avec pg-boss.
 *
 * Ce qui est réellement testé ici, c'est le transport pg-boss : un job publié dans
 * Postgres est bien distribué au handler et traité. La couche métier, elle, est
 * couverte par webhook-processor.test.ts — d'où le mock complet de Prisma ci-dessous.
 *
 * Note: Ces tests nécessitent une connexion PostgreSQL (DATABASE_URL).
 * Pour exécuter localement: RUN_INTEGRATION_TESTS=true npm test -- webhook-processor.integration.test.ts
 *
 * ⚠️ Ces tests sont désactivés par défaut (skip) car ils nécessitent une DB.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PgBoss } from "pg-boss";
import { processWebhookJob } from "./webhook-processor";
import type { InboundMessage, EnrichedInboundMessage } from "../messaging/types";
import { db } from "~/server/db";
import type { PgBossJob } from "./queues";

/**
 * pg-boss met quelques secondes à distribuer un job (démarrage du worker + polling).
 * Le timeout vitest par défaut (5 s) expirait AVANT le garde-fou interne des tests
 * (10 s), qui ne servait donc jamais : les tests échouaient systématiquement.
 */
const PGBOSS_DELIVERY_TIMEOUT_MS = 20_000;

// Mock Prisma : ces tests portent sur le transport pg-boss, pas sur les accès DB.
// Le mock doit néanmoins couvrir tout ce que processWebhookJob appelle — sinon la
// moindre méthode manquante lève une exception qui ne résout NI ne rejette la
// promesse du handler, et le test part en timeout sans message utile.
vi.mock("~/server/db", () => {
  const tenantRow = {
    id: "tenant-integration",
    name: "Boutique Test",
    subscriptionPlan: "starter",
    requireDeposit: false,
    creditsBalance: 100,
    creditsBonus: 0,
    showBranding: false,
    businessTimezone: "Africa/Abidjan",
    businessHoursStart: "08:00",
    businessHoursEnd: "20:00",
    awayMessage: null,
    faqDelivery: null,
    faqPayment: null,
    faqLocation: null,
    faqAvailability: null,
  };

  const db: Record<string, unknown> = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    sellerPhone: { findMany: vi.fn() },
    tenant: {
      findUnique: vi.fn().mockResolvedValue(tenantRow),
      update: vi.fn().mockResolvedValue(tenantRow),
    },
    conversationWindow: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "win-1" }),
    },
    conversationState: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    optOut: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    catalogueItem: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    // `count` avait été remplacé par un `findMany` borné à deux lignes : le
    // processeur cherche seulement à savoir si c'est le premier message de la
    // cliente, pour lui souhaiter la bienvenue. Le mock avait gardé l'ancienne
    // méthode, et le test échouait sur un `findMany is not a function` — sans
    // rapport avec ce qu'il vérifie (le routage vendeur/cliente via pg-boss).
    // Tableau vide = première prise de contact.
    messageIn: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    messageOut: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "msg-out-1" }),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    order: { findFirst: vi.fn().mockResolvedValue(null) },
    reservation: { findFirst: vi.fn().mockResolvedValue(null) },
    liveItem: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    itemVariant: { findMany: vi.fn().mockResolvedValue([]) },
    waitlist: { findFirst: vi.fn().mockResolvedValue(null) },
  };

  // Supporte les deux formes : tableau d'opérations et callback interactif
  // (utilisé par checkAndConsumeCredit, qui prend un verrou FOR UPDATE).
  db.$transaction = vi.fn((arg: unknown) =>
    typeof arg === "function"
      ? (arg as (tx: unknown) => unknown)(db)
      : Promise.all(arg as Promise<unknown>[]),
  );

  return { db };
});

// Mock logger pour éviter le bruit dans les logs
vi.mock("~/lib/logger", () => ({
  workerLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock queues pour éviter la validation env
vi.mock("./queues", () => ({
  boss: { send: vi.fn() },
  QUEUE: { WEBHOOK_PROCESSING: "webhook-processing", OUTBOX_SEND: "outbox-send", OUTBOX_DLQ: "outbox-dlq" },
}));

vi.mock("~/server/events/eventLog", () => ({
  logOptOutRecorded: vi.fn().mockResolvedValue(undefined),
  logLiveItemCreated: vi.fn().mockResolvedValue(undefined),
  logLiveItemDuplicateRejected: vi.fn().mockResolvedValue(undefined),
  logLiveItemPhotoLinked: vi.fn().mockResolvedValue(undefined),
  logCatalogueItemPhotoLinked: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/server/live-session/service", () => ({
  getCurrentSessionReadOnly: vi.fn().mockResolvedValue(null),
}));

vi.mock("~/server/reservation/service", () => ({
  createReservation: vi.fn(),
  getActiveReservationForClient: vi.fn().mockResolvedValue(null),
  collectAddress: vi.fn(),
}));

vi.mock("~/server/messaging/outbox", () => ({
  writeToOutbox: vi.fn(),
}));

vi.mock("~/server/catalogue/findOrderableItemByCode", () => ({
  findOrderableItemByCode: vi.fn(),
}));

vi.mock("~/server/catalogue/findOrCreateOrderableItemByCode", () => ({
  findOrCreateOrderableItemByCode: vi.fn(),
}));

vi.mock("~/server/catalogue/upsertCatalogueItemFromWebhook", () => ({
  upsertCatalogueItemFromWebhook: vi.fn(),
}));

vi.mock("~/server/live-item/createLiveItem", () => ({
  createLiveItem: vi.fn(),
  messageCodeAlreadyUsed: vi.fn(),
  messageCodeUnknown: vi.fn(),
  messageCodeUnknownSuggestion: vi.fn(),
  normalizeCode: vi.fn((s: string) => s.trim().toUpperCase()),
}));

vi.mock("~/server/live-item/getLastEditedLiveItemInWindow", () => ({
  getLastEditedLiveItemInWindow: vi.fn(),
}));

vi.mock("~/server/media/uploadMediaToLiveItem", () => ({
  uploadMediaAndLinkToLiveItem: vi.fn(),
}));

vi.mock("~/server/media/uploadMediaToCatalogueItem", () => ({
  uploadMediaToCatalogueItem: vi.fn(),
}));

vi.mock("~/server/media/r2-client", () => ({
  isR2Configured: vi.fn().mockReturnValue(false),
}));

vi.mock("~/server/waitlist/addToWaitlist", () => ({
  addToWaitlist: vi.fn(),
}));

vi.mock("~/server/order/createOrderFromReservation", () => ({
  createOrderFromReservation: vi.fn(),
}));

vi.mock("~/lib/sentry", () => ({
  captureException: vi.fn().mockResolvedValue(undefined),
}));

// Chaque test enchaîne des allers-retours vers une base distante ; le défaut
// de 5 s de Vitest est calibré pour des tests en mémoire.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const shouldRunIntegrationTests =
  process.env.RUN_INTEGRATION_TESTS === "true" && !!process.env.DATABASE_URL;

describe.skipIf(!shouldRunIntegrationTests)(
  "webhook-processor integration (pg-boss)",
  () => {
    let testBoss: PgBoss;
    const queueName = "webhook-processing-test";

    beforeAll(async () => {
      testBoss = new PgBoss({
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      });
      await testBoss.start();
      await testBoss.createQueue(queueName, {
        retryLimit: 2,
        retryDelay: 2,
        retryBackoff: true,
        deleteAfterSeconds: 60,
      });
    });

    afterAll(async () => {
      await testBoss.stop({ graceful: true, timeout: 5000 });
    });

    beforeEach(() => {
      vi.clearAllMocks();
    });

    /**
     * Publie un job puis attend qu'il soit distribué et traité.
     *
     * Chaque appel utilise une queue DÉDIÉE et désenregistre son worker à la fin.
     * Sans cela, le worker du premier test restait actif et consommait le job du
     * second : la promesse du second test n'était jamais résolue et il partait en
     * timeout — c'était la cause réelle de l'échec, pas la lenteur de pg-boss.
     */
    async function publishAndProcess(
      jobData: InboundMessage,
      label: string,
    ): Promise<EnrichedInboundMessage> {
      const isolatedQueue = `${queueName}-${label}-${Date.now()}`;
      await testBoss.createQueue(isolatedQueue, { deleteAfterSeconds: 60 });

      const jobId = await testBoss.send(isolatedQueue, jobData);
      expect(jobId).toBeTruthy();

      let workerId: string | undefined;
      try {
        return await new Promise<EnrichedInboundMessage>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Job processing timeout (queue ${isolatedQueue})`));
          }, PGBOSS_DELIVERY_TIMEOUT_MS - 2_000);

          void testBoss
            .work<InboundMessage>(
              isolatedQueue,
              { localConcurrency: 1 },
              async (jobs: PgBossJob<InboundMessage>[]) => {
                clearTimeout(timeout);
                const job = jobs[0];
                if (!job) {
                  reject(new Error("No job received from pg-boss worker"));
                  return;
                }
                try {
                  resolve(await processWebhookJob(job));
                } catch (err) {
                  // Sans ce rejet, une exception métier laissait la promesse pendante
                  // et le test échouait en timeout au lieu d'afficher la vraie erreur.
                  reject(err instanceof Error ? err : new Error(String(err)));
                }
              },
            )
            .then((id) => {
              workerId = id;
            })
            .catch(reject);
        });
      } finally {
        if (workerId) await testBoss.offWork(isolatedQueue);
      }
    }

    it(
      "should process job and determine message type as seller",
      async () => {
      const tenantId = "tenant-integration-1";
      const sellerPhoneNumber = "+33612345678";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([
        {
          id: "seller-phone-1",
          tenantId,
          phoneNumber: sellerPhoneNumber,
          createdAt: new Date(),
        },
      ]);

      const jobData: InboundMessage = {
        tenantId,
        providerMessageId: "SM-INTEGRATION-1",
        from: `whatsapp:${sellerPhoneNumber}`,
        body: "A12",
        correlationId: "corr-integration-1",
      };

      const result = await publishAndProcess(jobData, "seller");

      expect(result.messageType).toBe("seller");
      expect(result.tenantId).toBe(tenantId);
        expect(result.providerMessageId).toBe("SM-INTEGRATION-1");
      },
      PGBOSS_DELIVERY_TIMEOUT_MS,
    );

    it(
      "should process job and determine message type as client",
      async () => {
      const tenantId = "tenant-integration-2";
      const clientPhoneNumber = "+33698765432";

      vi.mocked(db.sellerPhone.findMany).mockResolvedValue([]);

      const jobData: InboundMessage = {
        tenantId,
        providerMessageId: "SM-INTEGRATION-2",
        from: `whatsapp:${clientPhoneNumber}`,
        body: "Bonjour",
        correlationId: "corr-integration-2",
      };

      const result = await publishAndProcess(jobData, "client");

        expect(result.messageType).toBe("client");
        expect(result.tenantId).toBe(tenantId);
      },
      PGBOSS_DELIVERY_TIMEOUT_MS,
    );
  },
);
