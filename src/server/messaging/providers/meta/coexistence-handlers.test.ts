import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMessageOutUpsert = vi.hoisted(() => vi.fn());
const mockMessageInUpsert = vi.hoisted(() => vi.fn());
const mockContactUpsert = vi.hoisted(() => vi.fn());
const mockContactDeleteMany = vi.hoisted(() => vi.fn());
const mockTenantUpdate = vi.hoisted(() => vi.fn());
const mockOutboxWrite = vi.hoisted(() => vi.fn());
const mockBossSend = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    messageOut: { upsert: mockMessageOutUpsert },
    messageIn: { upsert: mockMessageInUpsert },
    whatsAppContact: { upsert: mockContactUpsert, deleteMany: mockContactDeleteMany },
    tenant: { update: mockTenantUpdate },
  },
}));

/*
  Ces deux-là sont la raison d'être du fichier : ils ne doivent jamais être
  appelés. Les mocker permet de l'affirmer plutôt que de l'espérer.
*/
vi.mock("~/server/messaging/outbox", () => ({ writeToOutbox: mockOutboxWrite }));
vi.mock("~/server/workers/queues", () => ({
  boss: { send: mockBossSend },
  ensureBossReady: vi.fn(),
  QUEUE: { WEBHOOK_PROCESSING: "webhook-processing" },
}));

vi.mock("~/lib/logger", () => ({
  webhookLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  handleAppStateSync,
  handleHistory,
  handleMessageEchoes,
} from "./coexistence-handlers";

const TENANT = "tenant-1";
const CORRELATION = "corr-1";

describe("handleMessageEchoes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enregistre l'echo comme sortant, pas comme entrant", async () => {
    const written = await handleMessageEchoes({
      tenantId: TENANT,
      correlationId: CORRELATION,
      value: {
        message_echoes: [
          {
            from: "15550783881",
            to: "16505551234",
            id: "wamid.echo1",
            timestamp: "1739321024",
            type: "text",
            text: { body: "Voici l'info demandée" },
          },
        ],
      },
    });

    expect(written).toBe(1);
    expect(mockMessageInUpsert).not.toHaveBeenCalled();
    expect(mockMessageOutUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          tenantId: TENANT,
          body: "Voici l'info demandée",
          // « sent » et non « pending » : le message est déjà parti, et pas par
          // nous. L'outbox ne doit surtout pas le reprendre pour l'envoyer.
          status: "sent",
          providerMessageId: "wamid.echo1",
        }),
      }),
    );
  });

  /**
   * La règle qui justifie tout ce module. `webhook-processor.ts` répond
   * automatiquement à ce qu'il reçoit ; y faire entrer un écho ferait répondre
   * SnapSell à la boutique elle-même, dans la conversation, devant la cliente.
   */
  it("ne declenche aucune reponse automatique", async () => {
    await handleMessageEchoes({
      tenantId: TENANT,
      correlationId: CORRELATION,
      value: {
        message_echoes: [
          { from: "15550783881", to: "16505551234", id: "wamid.echo2", type: "text", text: { body: "Bonjour" } },
        ],
      },
    });

    expect(mockOutboxWrite).not.toHaveBeenCalled();
    expect(mockBossSend).not.toHaveBeenCalled();
  });

  it("ignore un echo sans identifiant exploitable", async () => {
    const written = await handleMessageEchoes({
      tenantId: TENANT,
      correlationId: CORRELATION,
      value: { message_echoes: [{ to: "16505551234", type: "text" }] },
    });

    expect(written).toBe(0);
    expect(mockMessageOutUpsert).not.toHaveBeenCalled();
  });

  it("supporte un payload vide sans lever", async () => {
    await expect(
      handleMessageEchoes({ tenantId: TENANT, correlationId: CORRELATION, value: {} }),
    ).resolves.toBe(0);
  });
});

describe("handleAppStateSync", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ajoute un contact", async () => {
    const applied = await handleAppStateSync({
      tenantId: TENANT,
      correlationId: CORRELATION,
      value: {
        state_sync: [
          {
            type: "contact",
            contact: { full_name: "Awa Koné", first_name: "Awa", phone_number: "+2250701020304" },
            action: "add",
          },
        ],
      },
    });

    expect(applied).toBe(1);
    expect(mockContactUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ fullName: "Awa Koné", firstName: "Awa" }),
      }),
    );
  });

  it("retire un contact", async () => {
    await handleAppStateSync({
      tenantId: TENANT,
      correlationId: CORRELATION,
      value: {
        state_sync: [
          { type: "contact", contact: { phone_number: "+2250701020304" }, action: "remove" },
        ],
      },
    });

    expect(mockContactDeleteMany).toHaveBeenCalled();
    expect(mockContactUpsert).not.toHaveBeenCalled();
  });

  it("ignore une action inconnue plutot que de la deviner", async () => {
    const applied = await handleAppStateSync({
      tenantId: TENANT,
      correlationId: CORRELATION,
      value: {
        state_sync: [
          { type: "contact", contact: { phone_number: "+2250701020304" }, action: "teleport" },
        ],
      },
    });

    expect(applied).toBe(0);
    expect(mockContactUpsert).not.toHaveBeenCalled();
    expect(mockContactDeleteMany).not.toHaveBeenCalled();
  });
});

describe("handleHistory", () => {
  beforeEach(() => vi.clearAllMocks());

  function historyValue(progress: string, messages: unknown[]) {
    return {
      metadata: { display_phone_number: "+2250700000000", phone_number_id: "PN" },
      history: [
        {
          metadata: { phase: "1", chunk_order: 1, progress },
          threads: [{ id: "+2250701020304", messages }],
        },
      ],
    };
  }

  /**
   * Le sens de lecture vient de `from`. Sans cette distinction, les réponses de
   * la boutique apparaîtraient comme des messages reçus — une conversation
   * illisible, où elle semblerait s'écrire à elle-même.
   */
  it("range les messages selon leur emetteur", async () => {
    await handleHistory({
      tenantId: TENANT,
      correlationId: CORRELATION,
      value: historyValue("50", [
        { from: "+2250701020304", to: "+2250700000000", id: "wamid.in", type: "text", text: { body: "Bonjour" } },
        { from: "+2250700000000", to: "+2250701020304", id: "wamid.out", type: "text", text: { body: "Bonjour !" } },
      ]),
    });

    expect(mockMessageInUpsert).toHaveBeenCalledTimes(1);
    expect(mockMessageOutUpsert).toHaveBeenCalledTimes(1);
  });

  it("n'enfile ni ne repond pour un historique vieux de plusieurs mois", async () => {
    await handleHistory({
      tenantId: TENANT,
      correlationId: CORRELATION,
      value: historyValue("50", [
        { from: "+2250701020304", to: "+2250700000000", id: "wamid.in", type: "text", text: { body: "A3" } },
      ]),
    });

    expect(mockOutboxWrite).not.toHaveBeenCalled();
    expect(mockBossSend).not.toHaveBeenCalled();
  });

  it("reste « en cours » tant que la progression n'atteint pas 100", async () => {
    await handleHistory({
      tenantId: TENANT,
      correlationId: CORRELATION,
      value: historyValue("40", []),
    });

    expect(mockTenantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { metaHistorySyncStatus: "in_progress" } }),
    );
  });

  it("marque « termine » a 100", async () => {
    await handleHistory({
      tenantId: TENANT,
      correlationId: CORRELATION,
      value: historyValue("100", []),
    });

    expect(mockTenantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { metaHistorySyncStatus: "completed" } }),
    );
  });

  /**
   * Meta documente `progress` sans en préciser le format. Une valeur
   * inexploitable doit laisser « en cours » : annoncer une reprise complète
   * alors qu'il manque des conversations serait le mauvais sens de l'erreur.
   */
  it("reste prudent sur une progression illisible", async () => {
    await handleHistory({
      tenantId: TENANT,
      correlationId: CORRELATION,
      value: historyValue("presque fini", []),
    });

    expect(mockTenantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { metaHistorySyncStatus: "in_progress" } }),
    );
  });

  it("extrait la legende d'un media", async () => {
    await handleHistory({
      tenantId: TENANT,
      correlationId: CORRELATION,
      value: historyValue("10", [
        {
          from: "+2250701020304",
          to: "+2250700000000",
          id: "wamid.img",
          type: "image",
          image: { id: "media-1", caption: "Le sac bleu" },
        },
      ]),
    });

    expect(mockMessageInUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ body: "Le sac bleu" }),
      }),
    );
  });
});
