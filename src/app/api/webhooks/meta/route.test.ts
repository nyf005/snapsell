import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import { metaWebhookSchema, metaWebhookMessageSchema } from "~/lib/zod/webhook";

// ─── Mocks ───

const mockWebhookLoggerWarn = vi.hoisted(() => vi.fn());
const mockWebhookLoggerError = vi.hoisted(() => vi.fn());
const mockWebhookLoggerInfo = vi.hoisted(() => vi.fn());
const mockWebhookLoggerDebug = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    tenant: {
      findUnique: vi.fn(),
    },
    messageIn: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("~/server/workers/queues", () => ({
  boss: {
    send: vi.fn().mockResolvedValue("job-id-mock"),
  },
  ensureBossReady: vi.fn().mockResolvedValue(undefined),
  QUEUE: {
    WEBHOOK_PROCESSING: "webhook-processing",
    OUTBOX_SEND: "outbox-send",
    OUTBOX_DLQ: "outbox-dlq",
  },
}));

vi.mock("~/server/events/eventLog", () => ({
  logWebhookReceived: vi.fn().mockResolvedValue(undefined),
  logIdempotentIgnored: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/lib/sentry", () => ({
  captureException: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("~/lib/logger", () => ({
  webhookLogger: {
    warn: mockWebhookLoggerWarn,
    error: mockWebhookLoggerError,
    info: mockWebhookLoggerInfo,
    debug: mockWebhookLoggerDebug,
  },
}));

vi.mock("~/lib/rate-limit", () => ({
  checkWebhookRateLimit: vi.fn().mockResolvedValue(true),
  getClientIpFromRequest: vi.fn().mockReturnValue("127.0.0.1"),
}));

// Mock env with META_VERIFY_TOKEN and META_APP_SECRET
vi.mock("~/env", () => ({
  env: {
    META_VERIFY_TOKEN: "test-verify-token",
    META_APP_SECRET: "test-app-secret",
    NODE_ENV: "production",
    WEBHOOK_RATE_LIMIT_MAX: 120,
    WEBHOOK_RATE_LIMIT_WINDOW_MS: 60000,
  },
}));

vi.mock("~/server/messaging/providers/meta/adapter", () => ({
  MetaCloudAdapter: vi.fn().mockImplementation(function () {
    return { parseInboundBatch: vi.fn() };
  }),
}));

// ─── Task 1: Tests schema Zod metaWebhookSchema ───

describe("metaWebhookMessageSchema", () => {
  it("valide un message text complet", () => {
    const msg = {
      from: "22891234567",
      id: "wamid.HBgNMjI4OTEyMzQ1Njc",
      timestamp: "1710000000",
      type: "text",
      text: { body: "Bonjour" },
    };
    expect(metaWebhookMessageSchema.parse(msg)).toEqual(msg);
  });

  it("valide un message image", () => {
    const msg = {
      from: "22891234567",
      id: "wamid.abc",
      timestamp: "1710000000",
      type: "image",
      image: { mime_type: "image/jpeg", sha256: "abc123", id: "img_001" },
    };
    expect(() => metaWebhookMessageSchema.parse(msg)).not.toThrow();
  });

  it("valide un message document avec filename optionnel", () => {
    const msg = {
      from: "22891234567",
      id: "wamid.doc",
      timestamp: "1710000000",
      type: "document",
      document: { mime_type: "application/pdf", sha256: "xyz", id: "doc_001", filename: "facture.pdf" },
    };
    expect(() => metaWebhookMessageSchema.parse(msg)).not.toThrow();
  });

  it("rejette un message sans from", () => {
    const msg = { id: "wamid.abc", timestamp: "1710000000", type: "text" };
    expect(() => metaWebhookMessageSchema.parse(msg)).toThrow();
  });

  it("rejette un message sans id", () => {
    const msg = { from: "22891234567", timestamp: "1710000000", type: "text" };
    expect(() => metaWebhookMessageSchema.parse(msg)).toThrow();
  });
});

describe("metaWebhookSchema", () => {
  const validPayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15551234567",
                phone_number_id: "PHONE_NUMBER_ID",
              },
              messages: [
                {
                  from: "22891234567",
                  id: "wamid.HBgNMjI4OTEyMzQ1Njc",
                  timestamp: "1710000000",
                  type: "text",
                  text: { body: "A3" },
                },
              ],
              contacts: [{ profile: { name: "Client" }, wa_id: "22891234567" }],
            },
            field: "messages",
          },
        ],
      },
    ],
  };

  it("valide un payload Meta complet avec message text", () => {
    expect(() => metaWebhookSchema.parse(validPayload)).not.toThrow();
  });

  it("valide un payload status-only (sans messages[])", () => {
    const statusOnly = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "15551234567",
                  phone_number_id: "PHONE_NUMBER_ID",
                },
                statuses: [
                  {
                    id: "wamid.xyz",
                    status: "delivered",
                    timestamp: "1710000000",
                    recipient_id: "22891234567",
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };
    expect(() => metaWebhookSchema.parse(statusOnly)).not.toThrow();
  });

  it("valide un payload batch multi-messages", () => {
    const batch = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "15551234567",
                  phone_number_id: "PHONE_NUMBER_ID",
                },
                messages: [
                  { from: "111", id: "wamid.1", timestamp: "1710000000", type: "text", text: { body: "A1" } },
                  { from: "222", id: "wamid.2", timestamp: "1710000001", type: "text", text: { body: "B2" } },
                  { from: "333", id: "wamid.3", timestamp: "1710000002", type: "text", text: { body: "C3" } },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };
    const parsed = metaWebhookSchema.parse(batch);
    expect(parsed.entry[0]!.changes[0]!.value.messages).toHaveLength(3);
  });

  it("rejette un payload avec object invalide", () => {
    const invalid = { ...validPayload, object: "instagram" };
    expect(() => metaWebhookSchema.parse(invalid)).toThrow();
  });

  it("rejette un payload avec field invalide", () => {
    const invalid = structuredClone(validPayload);
    invalid.entry[0]!.changes[0]!.field = "account" as never;
    expect(() => metaWebhookSchema.parse(invalid)).toThrow();
  });

  it("rejette un payload sans messaging_product whatsapp", () => {
    const invalid = structuredClone(validPayload);
    invalid.entry[0]!.changes[0]!.value.messaging_product = "facebook" as never;
    expect(() => metaWebhookSchema.parse(invalid)).toThrow();
  });

  it("extrait phone_number_id depuis metadata", () => {
    const parsed = metaWebhookSchema.parse(validPayload);
    expect(parsed.entry[0]!.changes[0]!.value.metadata.phone_number_id).toBe("PHONE_NUMBER_ID");
  });
});

// ─── Task 2: Tests route GET challenge (AC #1) ───

describe("GET /api/webhooks/meta — challenge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function callGET(params: Record<string, string>) {
    // Dynamic import to get fresh module with mocked deps
    const { GET } = await import("./route");
    const url = new URL("http://localhost:3000/api/webhooks/meta");
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return GET(new Request(url.toString()));
  }

  it("challenge valide → 200 + retourne hub.challenge", async () => {
    const resp = await callGET({
      "hub.mode": "subscribe",
      "hub.verify_token": "test-verify-token",
      "hub.challenge": "CHALLENGE_CODE_123",
    });
    expect(resp.status).toBe(200);
    const body = await resp.text();
    expect(body).toBe("CHALLENGE_CODE_123");
  });

  it("token invalide → 403", async () => {
    const resp = await callGET({
      "hub.mode": "subscribe",
      "hub.verify_token": "wrong-token",
      "hub.challenge": "CHALLENGE_CODE_123",
    });
    expect(resp.status).toBe(403);
    expect(mockWebhookLoggerWarn).toHaveBeenCalledWith(
      "Meta webhook challenge failed",
      expect.objectContaining({
        mode: "subscribe",
        hasVerifyToken: true,
      }),
    );
    expect(JSON.stringify(mockWebhookLoggerWarn.mock.calls)).not.toContain("wrong-token");
  });

  it("mode invalide → 403", async () => {
    const resp = await callGET({
      "hub.mode": "unsubscribe",
      "hub.verify_token": "test-verify-token",
      "hub.challenge": "CHALLENGE_CODE_123",
    });
    expect(resp.status).toBe(403);
  });

  it("META_VERIFY_TOKEN absent → 403", async () => {
    // Temporarily override env
    const envMod = await import("~/env");
    const original = envMod.env.META_VERIFY_TOKEN;
    (envMod.env as Record<string, unknown>).META_VERIFY_TOKEN = undefined;
    try {
      const resp = await callGET({
        "hub.mode": "subscribe",
        "hub.verify_token": "test-verify-token",
        "hub.challenge": "CHALLENGE_CODE_123",
      });
      expect(resp.status).toBe(403);
    } finally {
      (envMod.env as Record<string, unknown>).META_VERIFY_TOKEN = original;
    }
  });
});

// ─── Task 3 & 4: Tests route POST inbound (AC #2, #4, #5) ───

function signPayload(body: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function makeMetaPayload(messages: Array<Record<string, unknown>>, phoneNumberId = "PN_ID_123") {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15551234567",
                phone_number_id: phoneNumberId,
              },
              messages,
              contacts: [{ profile: { name: "Client" }, wa_id: "22891234567" }],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

function makeStatusOnlyPayload(phoneNumberId = "PN_ID_123") {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15551234567",
                phone_number_id: phoneNumberId,
              },
              statuses: [{ id: "wamid.xyz", status: "delivered", timestamp: "1710000000", recipient_id: "22891234567" }],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

describe("POST /api/webhooks/meta — inbound", () => {
  let dbMock: typeof import("~/server/db");
  let queueMock: typeof import("~/server/workers/queues");
  let adapterModule: typeof import("~/server/messaging/providers/meta/adapter");
  let rateLimitMock: typeof import("~/lib/rate-limit");

  beforeEach(async () => {
    vi.clearAllMocks();
    dbMock = await import("~/server/db");
    queueMock = await import("~/server/workers/queues");
    adapterModule = await import("~/server/messaging/providers/meta/adapter");
    rateLimitMock = await import("~/lib/rate-limit");
    // Re-set rate limit mock after clearAllMocks
    vi.mocked(rateLimitMock.checkWebhookRateLimit).mockResolvedValue(true);
  });

  async function callPOST(body: string, signature?: string) {
    const { POST } = await import("./route");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (signature) headers["X-Hub-Signature-256"] = signature;
    return POST(new Request("http://localhost:3000/api/webhooks/meta", {
      method: "POST",
      headers,
      body,
    }));
  }

  it("single message text → 200 + persist + enqueue", async () => {
    const payload = makeMetaPayload([
      { from: "22891234567", id: "wamid.abc", timestamp: "1710000000", type: "text", text: { body: "A3" } },
    ]);
    const bodyText = JSON.stringify(payload);
    const sig = signPayload(bodyText, "test-app-secret");

    // Mock tenant found
    vi.mocked(dbMock.db.tenant.findUnique).mockResolvedValue({ id: "tenant-1", metaPhoneNumberId: "PN_ID_123", metaAccessToken: "tok" } as never);
    // Mock no existing message (idempotence)
    vi.mocked(dbMock.db.messageIn.findUnique).mockResolvedValue(null);
    // Mock create
    vi.mocked(dbMock.db.messageIn.create).mockResolvedValue({ id: "msg-1", correlationId: "wamid.abc" } as never);
    // Mock adapter parseInboundBatch
    const mockParseInboundBatch = vi.fn().mockResolvedValue([
      { tenantId: null, providerMessageId: "wamid.abc", from: "+22891234567", body: "A3", correlationId: "wamid.abc" },
    ]);
    vi.mocked(adapterModule.MetaCloudAdapter).mockImplementation(function () {
      return {
        parseInboundBatch: mockParseInboundBatch,
        parseInbound: vi.fn(),
        send: vi.fn(),
        verifySignature: vi.fn(),
      };
    } as never);

    const resp = await callPOST(bodyText, sig);
    expect(resp.status).toBe(200);
    expect(dbMock.db.messageIn.create).toHaveBeenCalledTimes(1);
    expect(queueMock.boss.send).toHaveBeenCalledTimes(1);
  });

  it("batch multi-messages → N persist + N enqueue", async () => {
    const payload = makeMetaPayload([
      { from: "111", id: "wamid.1", timestamp: "1710000000", type: "text", text: { body: "A1" } },
      { from: "222", id: "wamid.2", timestamp: "1710000001", type: "text", text: { body: "B2" } },
      { from: "333", id: "wamid.3", timestamp: "1710000002", type: "text", text: { body: "C3" } },
    ]);
    const bodyText = JSON.stringify(payload);
    const sig = signPayload(bodyText, "test-app-secret");

    vi.mocked(dbMock.db.tenant.findUnique).mockResolvedValue({ id: "tenant-1", metaPhoneNumberId: "PN_ID_123", metaAccessToken: "tok" } as never);
    vi.mocked(dbMock.db.messageIn.findUnique).mockResolvedValue(null);
    vi.mocked(dbMock.db.messageIn.create).mockImplementation((args) => {
      const data = (args as { data: { providerMessageId: string; correlationId: string } }).data;
      return Promise.resolve({ id: `msg-${data.providerMessageId}`, correlationId: data.correlationId }) as never;
    });

    const mockParseInboundBatch = vi.fn().mockResolvedValue([
      { tenantId: null, providerMessageId: "wamid.1", from: "+111", body: "A1", correlationId: "wamid.1" },
      { tenantId: null, providerMessageId: "wamid.2", from: "+222", body: "B2", correlationId: "wamid.2" },
      { tenantId: null, providerMessageId: "wamid.3", from: "+333", body: "C3", correlationId: "wamid.3" },
    ]);
    vi.mocked(adapterModule.MetaCloudAdapter).mockImplementation(function () {
      return {
        parseInboundBatch: mockParseInboundBatch,
        parseInbound: vi.fn(),
        send: vi.fn(),
        verifySignature: vi.fn(),
      };
    } as never);

    const resp = await callPOST(bodyText, sig);
    expect(resp.status).toBe(200);
    expect(dbMock.db.messageIn.create).toHaveBeenCalledTimes(3);
    expect(queueMock.boss.send).toHaveBeenCalledTimes(3);
  });

  it("tenant non trouve → 200 + persist MessageIn avec tenantId null", async () => {
    const payload = makeMetaPayload([
      { from: "22891234567", id: "wamid.abc", timestamp: "1710000000", type: "text", text: { body: "A3" } },
    ]);
    const bodyText = JSON.stringify(payload);
    const sig = signPayload(bodyText, "test-app-secret");

    vi.mocked(dbMock.db.tenant.findUnique).mockResolvedValue(null);
    vi.mocked(dbMock.db.messageIn.create).mockResolvedValue({ id: "msg-orphan" } as never);

    const resp = await callPOST(bodyText, sig);
    expect(resp.status).toBe(200);
    // Persist with null tenantId
    expect(dbMock.db.messageIn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: null }),
      }),
    );
    // No enqueue (no tenant)
    expect(queueMock.boss.send).not.toHaveBeenCalled();
  });

  it("signature invalide → 401", async () => {
    const payload = makeMetaPayload([
      { from: "22891234567", id: "wamid.abc", timestamp: "1710000000", type: "text", text: { body: "A3" } },
    ]);
    const bodyText = JSON.stringify(payload);

    const resp = await callPOST(bodyText, "sha256=invalidsignature");
    expect(resp.status).toBe(401);
  });

  it("payload status-only (pas de messages[]) → 200 sans persist", async () => {
    const payload = makeStatusOnlyPayload();
    const bodyText = JSON.stringify(payload);
    const sig = signPayload(bodyText, "test-app-secret");

    vi.mocked(dbMock.db.tenant.findUnique).mockResolvedValue({ id: "tenant-1", metaPhoneNumberId: "PN_ID_123", metaAccessToken: "tok" } as never);

    const mockParseInboundBatch = vi.fn().mockResolvedValue([]);
    vi.mocked(adapterModule.MetaCloudAdapter).mockImplementation(function () {
      return {
        parseInboundBatch: mockParseInboundBatch,
        parseInbound: vi.fn(),
        send: vi.fn(),
        verifySignature: vi.fn(),
      };
    } as never);

    const resp = await callPOST(bodyText, sig);
    expect(resp.status).toBe(200);
    expect(dbMock.db.messageIn.create).not.toHaveBeenCalled();
    expect(queueMock.boss.send).not.toHaveBeenCalled();
  });

  it("message image → 200 + persist avec mediaUrl", async () => {
    const payload = makeMetaPayload([
      { from: "22891234567", id: "wamid.img1", timestamp: "1710000000", type: "image", image: { mime_type: "image/jpeg", sha256: "abc123", id: "img_001" } },
    ]);
    const bodyText = JSON.stringify(payload);
    const sig = signPayload(bodyText, "test-app-secret");

    vi.mocked(dbMock.db.tenant.findUnique).mockResolvedValue({ id: "tenant-1", metaPhoneNumberId: "PN_ID_123", metaAccessToken: "tok" } as never);
    vi.mocked(dbMock.db.messageIn.findUnique).mockResolvedValue(null);
    vi.mocked(dbMock.db.messageIn.create).mockResolvedValue({ id: "msg-img", correlationId: "uuid-img" } as never);

    const mockParseInboundBatch = vi.fn().mockResolvedValue([
      { tenantId: null, providerMessageId: "wamid.img1", from: "+22891234567", body: "", mediaUrl: "meta-media://img_001", correlationId: "wamid.img1" },
    ]);
    vi.mocked(adapterModule.MetaCloudAdapter).mockImplementation(function () {
      return {
        parseInboundBatch: mockParseInboundBatch,
        parseInbound: vi.fn(),
        send: vi.fn(),
        verifySignature: vi.fn(),
      };
    } as never);

    const resp = await callPOST(bodyText, sig);
    expect(resp.status).toBe(200);
    expect(dbMock.db.messageIn.create).toHaveBeenCalledTimes(1);
    expect(dbMock.db.messageIn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mediaUrl: "meta-media://img_001" }),
      }),
    );
    expect(queueMock.boss.send).toHaveBeenCalledTimes(1);
  });

  it("idempotence — message deja existant → 200 sans doublon", async () => {
    const payload = makeMetaPayload([
      { from: "22891234567", id: "wamid.dup", timestamp: "1710000000", type: "text", text: { body: "A3" } },
    ]);
    const bodyText = JSON.stringify(payload);
    const sig = signPayload(bodyText, "test-app-secret");

    vi.mocked(dbMock.db.tenant.findUnique).mockResolvedValue({ id: "tenant-1", metaPhoneNumberId: "PN_ID_123", metaAccessToken: "tok" } as never);
    // Message already exists
    vi.mocked(dbMock.db.messageIn.findUnique).mockResolvedValue({ id: "msg-existing", correlationId: "wamid.dup" } as never);

    const mockParseInboundBatch = vi.fn().mockResolvedValue([
      { tenantId: null, providerMessageId: "wamid.dup", from: "+22891234567", body: "A3", correlationId: "wamid.dup" },
    ]);
    vi.mocked(adapterModule.MetaCloudAdapter).mockImplementation(function () {
      return {
        parseInboundBatch: mockParseInboundBatch,
        parseInbound: vi.fn(),
        send: vi.fn(),
        verifySignature: vi.fn(),
      };
    } as never);

    const resp = await callPOST(bodyText, sig);
    expect(resp.status).toBe(200);
    // Pas de seconde écriture : c'est ça, l'idempotence.
    expect(dbMock.db.messageIn.create).not.toHaveBeenCalled();

    // L'enfilage, lui, est bien retenté — et c'est voulu. Ce chemin est le seul
    // moyen de rattraper un message écrit dont la mise en file avait échoué :
    // Meta rejoue le lot, on retombe ici, et le job repart. `singletonKey`
    // garantit qu'un job déjà présent n'est pas dupliqué.
    expect(queueMock.boss.send).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ providerMessageId: "wamid.dup" }),
      expect.objectContaining({ singletonKey: "tenant-1-wamid.dup" }),
    );
  });

  /**
   * Le limiteur de débit ne doit plus pouvoir arrêter la réception.
   *
   * Il répondait 503 quand Redis était injoignable. La base Upstash ayant été
   * supprimée, le webhook a rejeté *chaque* message pendant toute la panne —
   * découvert en interrogeant l'endpoint à la main, faute d'alerte. Une
   * protection contre les abus ne peut pas mettre la vente à l'arrêt, d'autant
   * que la signature HMAC vérifiée juste après fait le vrai tri.
   *
   * Ici la requête est mal signée : elle doit donc être refusée par la
   * signature (401), et surtout pas par le limiteur (503).
   */
  it("laisse passer le limiteur quand Redis est injoignable", async () => {
    vi.mocked(rateLimitMock.checkWebhookRateLimit).mockRejectedValueOnce(
      new Error("shared rate-limit timeout"),
    );

    const payload = makeMetaPayload([
      { from: "22891234567", id: "wamid.rl", timestamp: "1710000000", type: "text", text: { body: "A9" } },
    ]);
    const bodyText = JSON.stringify(payload);

    const resp = await callPOST(bodyText, "sha256=signature-invalide");

    expect(resp.status).not.toBe(503);
    expect(resp.status).toBe(401);
  });

  /**
   * Le message est en base, mais la file est tombée. Répondre 200 disait à Meta
   * « bien reçu » : il ne rejouait jamais, et le message restait sans job — donc
   * sans réponse à la cliente, et sans trace, `MessageIn` n'ayant aucun champ de
   * statut ni job de rattrapage.
   */
  it("répond non-200 quand la mise en file échoue, pour que Meta rejoue", async () => {
    const payload = makeMetaPayload([
      { from: "22891234567", id: "wamid.enq-fail", timestamp: "1710000000", type: "text", text: { body: "A4" } },
    ]);
    const bodyText = JSON.stringify(payload);
    const sig = signPayload(bodyText, "test-app-secret");

    vi.mocked(dbMock.db.tenant.findUnique).mockResolvedValue({ id: "tenant-1", metaPhoneNumberId: "PN_ID_123", metaAccessToken: "tok" } as never);
    vi.mocked(dbMock.db.messageIn.findUnique).mockResolvedValue(null as never);
    vi.mocked(dbMock.db.messageIn.create).mockResolvedValue({ id: "msg-1", correlationId: "wamid.enq-fail" } as never);
    vi.mocked(queueMock.boss.send).mockRejectedValue(new Error("queue indisponible"));

    const mockParseInboundBatch = vi.fn().mockResolvedValue([
      { tenantId: null, providerMessageId: "wamid.enq-fail", from: "+22891234567", body: "A4", correlationId: "wamid.enq-fail" },
    ]);
    vi.mocked(adapterModule.MetaCloudAdapter).mockImplementation(function () {
      return {
        parseInboundBatch: mockParseInboundBatch,
        parseInbound: vi.fn(),
        send: vi.fn(),
        verifySignature: vi.fn(),
      };
    } as never);

    const resp = await callPOST(bodyText, sig);

    expect(resp.status).toBe(503);
    // Le message reste écrit : au rejeu, le chemin doublon atteindra l'enfilage.
    expect(dbMock.db.messageIn.create).toHaveBeenCalled();
  });
});

/**
 * ── LES ÉVÈNEMENTS DE COEXISTENCE NE SONT PLUS JETÉS EN SILENCE ─────────────
 *
 * Le schéma des messages était appliqué à tout ce qui arrivait, `field` compris.
 * Un webhook `smb_message_echoes`, `history` ou `smb_app_state_sync` échouait
 * donc à la validation et se perdait avec un avertissement qui ne disait même
 * pas de quel type d'évènement il s'agissait.
 *
 * Le risque le plus sérieux est l'écho : il porte les messages envoyés par la
 * vendeuse depuis son téléphone. S'il atteignait le pipeline entrant, SnapSell
 * y répondrait automatiquement — dans la conversation, devant la cliente.
 */
describe("POST /api/webhooks/meta — champs Coexistence", () => {
  let dbMock: typeof import("~/server/db");
  let queueMock: typeof import("~/server/workers/queues");
  let adapterModule: typeof import("~/server/messaging/providers/meta/adapter");
  let rateLimitMock: typeof import("~/lib/rate-limit");

  beforeEach(async () => {
    vi.clearAllMocks();
    dbMock = await import("~/server/db");
    queueMock = await import("~/server/workers/queues");
    adapterModule = await import("~/server/messaging/providers/meta/adapter");
    rateLimitMock = await import("~/lib/rate-limit");
    vi.mocked(rateLimitMock.checkWebhookRateLimit).mockResolvedValue(true);
    /*
      `vi.clearAllMocks()` efface les appels, pas les implémentations : un test
      antérieur qui met `boss.send` en échec pour vérifier le 503 laisse cette
      implémentation en place. On la rétablit explicitement plutôt que de
      dépendre de l'ordre des blocs.
    */
    vi.mocked(queueMock.boss.send).mockResolvedValue("job-id-mock" as never);
    vi.mocked(dbMock.db.tenant.findUnique).mockResolvedValue({
      id: "tenant-1",
      metaPhoneNumberId: "PN_ID_123",
      metaAccessToken: "tok",
    } as never);
  });

  async function callPOST(body: string) {
    const { POST } = await import("./route");
    return POST(
      new Request("http://localhost:3000/api/webhooks/meta", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": signPayload(body, "test-app-secret"),
        },
        body,
      }),
    );
  }

  function makeFieldPayload(field: string, value: Record<string, unknown> = {}) {
    return JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "WABA_ID", changes: [{ field, value }] }],
    });
  }

  it("un echo ne declenche aucune reponse automatique", async () => {
    const body = makeFieldPayload("smb_message_echoes", {
      messaging_product: "whatsapp",
      metadata: { display_phone_number: "15551234567", phone_number_id: "PN_ID_123" },
      message_echoes: [
        { from: "15551234567", to: "22891234567", id: "wamid.echo", type: "text", text: { body: "Bonjour" } },
      ],
    });

    const resp = await callPOST(body);

    expect(resp.status).toBe(200);
    // Rien n'entre dans le pipeline : ni message persisté, ni tâche enfilée.
    expect(dbMock.db.messageIn.create).not.toHaveBeenCalled();
    expect(queueMock.boss.send).not.toHaveBeenCalled();
    expect(adapterModule.MetaCloudAdapter).not.toHaveBeenCalled();
  });

  it("journalise l'echo en le nommant, au lieu d'un rejet muet", async () => {
    await callPOST(makeFieldPayload("smb_message_echoes"));

    expect(mockWebhookLoggerInfo).toHaveBeenCalledWith(
      "Meta webhook field hors pipeline entrant",
      expect.objectContaining({ field: "smb_message_echoes", kind: "echo" }),
    );
  });

  it.each(["history", "smb_app_state_sync"])(
    "accepte %s sans le traiter comme un message",
    async (field) => {
      const resp = await callPOST(makeFieldPayload(field));

      expect(resp.status).toBe(200);
      expect(queueMock.boss.send).not.toHaveBeenCalled();
      expect(mockWebhookLoggerInfo).toHaveBeenCalledWith(
        "Meta webhook field hors pipeline entrant",
        expect.objectContaining({ field, kind: "coexistence-sync" }),
      );
    },
  );

  it("nomme un champ inconnu au lieu de le perdre", async () => {
    const resp = await callPOST(makeFieldPayload("champ_invente_par_meta"));

    expect(resp.status).toBe(200);
    expect(mockWebhookLoggerInfo).toHaveBeenCalledWith(
      "Meta webhook field hors pipeline entrant",
      expect.objectContaining({ field: "champ_invente_par_meta", kind: "unknown" }),
    );
  });

  /**
   * ── UN LOT MIXTE NE DOIT PAS EMPORTER LE MESSAGE CLIENT ────────────────────
   *
   * L'aiguillage repère bien la présence de `messages`, mais la validation
   * stricte qui suit s'applique au payload **entier** et exige que chaque
   * changement soit `messages`. Un lot où Meta groupe un message client avec un
   * `history` échoue donc en bloc, et la cliente n'a jamais de réponse.
   */
  it("traite le message client meme groupe avec un evenement Coexistence", async () => {
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_ID",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "15551234567",
                  phone_number_id: "PN_ID_123",
                },
                messages: [
                  { from: "22891234567", id: "wamid.mixte", timestamp: "1710000000", type: "text", text: { body: "A3" } },
                ],
              },
            },
            { field: "history", value: { messaging_product: "whatsapp" } },
          ],
        },
      ],
    });
    vi.mocked(dbMock.db.messageIn.findUnique).mockResolvedValue(null);
    vi.mocked(dbMock.db.messageIn.create).mockResolvedValue({ id: "msg-1", correlationId: "wamid.mixte" } as never);
    vi.mocked(adapterModule.MetaCloudAdapter).mockImplementation(function () {
      return {
        parseInboundBatch: vi.fn().mockResolvedValue([
          { tenantId: null, providerMessageId: "wamid.mixte", from: "+22891234567", body: "A3", correlationId: "wamid.mixte" },
        ]),
        parseInbound: vi.fn(),
        send: vi.fn(),
        verifySignature: vi.fn(),
      };
    } as never);

    const resp = await callPOST(body);

    expect(resp.status).toBe(200);
    expect(queueMock.boss.send).toHaveBeenCalledTimes(1);
  });

  it("traite toujours normalement un payload messages", async () => {
    const body = JSON.stringify(
      makeMetaPayload([
        { from: "22891234567", id: "wamid.abc", timestamp: "1710000000", type: "text", text: { body: "A3" } },
      ]),
    );
    vi.mocked(dbMock.db.messageIn.findUnique).mockResolvedValue(null);
    vi.mocked(dbMock.db.messageIn.create).mockResolvedValue({ id: "msg-1", correlationId: "wamid.abc" } as never);
    vi.mocked(adapterModule.MetaCloudAdapter).mockImplementation(function () {
      return {
        parseInboundBatch: vi.fn().mockResolvedValue([
          { tenantId: null, providerMessageId: "wamid.abc", from: "+22891234567", body: "A3", correlationId: "wamid.abc" },
        ]),
        parseInbound: vi.fn(),
        send: vi.fn(),
        verifySignature: vi.fn(),
      };
    } as never);

    const resp = await callPOST(body);

    expect(resp.status).toBe(200);
    expect(queueMock.boss.send).toHaveBeenCalledTimes(1);
  });
});
