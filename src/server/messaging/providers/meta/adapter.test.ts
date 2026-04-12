import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";

// Mock logger
vi.mock("~/lib/logger", () => ({
  webhookLogger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  workerLogger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { MetaCloudAdapter } from "./adapter";

// --- Helpers ---

function makeMetaWebhookPayload(messages: unknown[], statuses?: unknown[]) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "WABA_ID",
      changes: [{
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: "33XXXXXXXXX",
            phone_number_id: "PHONE_NUMBER_ID",
          },
          ...(messages.length > 0 ? { messages } : {}),
          ...(statuses ? { statuses } : {}),
        },
        field: "messages",
      }],
    }],
  };
}

function makeJsonRequest(body: unknown): Request {
  return new Request("https://example.com/webhook/meta", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function computeHmac(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function makeSignedRequest(body: string, secret: string): Request {
  const hash = computeHmac(secret, body);
  return new Request("https://example.com/webhook/meta", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": `sha256=${hash}`,
    },
    body,
  });
}

// --- Tests ---

describe("MetaCloudAdapter", () => {
  const phoneNumberId = "123456789";
  const accessToken = "EAAxxxxxxx";
  const appSecret = "test-app-secret";
  let adapter: MetaCloudAdapter;

  beforeEach(() => {
    adapter = new MetaCloudAdapter(phoneNumberId, accessToken);
    vi.clearAllMocks();
  });

  // ===== Constructor validation (M1) =====
  describe("constructor", () => {
    it("should throw if phoneNumberId is empty", () => {
      expect(() => new MetaCloudAdapter("", accessToken)).toThrow(
        "phoneNumberId is required",
      );
    });

    it("should throw if accessToken is empty", () => {
      expect(() => new MetaCloudAdapter(phoneNumberId, "")).toThrow(
        "accessToken is required",
      );
    });
  });

  // ===== AC3: verifySignature =====
  describe("verifySignature", () => {
    it("should return true for valid HMAC-SHA256 signature", async () => {
      const body = JSON.stringify({ test: "payload" });
      const req = makeSignedRequest(body, appSecret);

      const result = await adapter.verifySignature(req, appSecret, body);

      expect(result).toBe(true);
    });

    it("should return false for invalid signature", async () => {
      const body = JSON.stringify({ test: "payload" });
      const wrongHash = computeHmac("wrong-secret", body);
      const req = new Request("https://example.com/webhook/meta", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": `sha256=${wrongHash}`,
        },
        body,
      });

      const result = await adapter.verifySignature(req, appSecret, body);

      expect(result).toBe(false);
    });

    it("should return false when X-Hub-Signature-256 header is missing", async () => {
      const req = new Request("https://example.com/webhook/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: "payload" }),
      });

      const result = await adapter.verifySignature(req, appSecret);

      expect(result).toBe(false);
    });

    it("should return false on internal error (malformed hex)", async () => {
      const req = new Request("https://example.com/webhook/meta", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": "sha256=not-valid-hex-$$$",
        },
        body: JSON.stringify({ test: "payload" }),
      });

      const result = await adapter.verifySignature(req, appSecret);

      expect(result).toBe(false);
    });

    it("should read body from request when bodyText not provided", async () => {
      const body = JSON.stringify({ test: "auto-read" });
      const req = makeSignedRequest(body, appSecret);

      const result = await adapter.verifySignature(req, appSecret);

      expect(result).toBe(true);
    });
  });

  // ===== AC2: parseInbound =====
  describe("parseInbound", () => {
    it("should parse single text message", async () => {
      const payload = makeMetaWebhookPayload([{
        from: "33612345678",
        id: "wamid.HBgNMzM2MTIzNDU2Nzg",
        timestamp: "1234567890",
        text: { body: "Bonjour" },
        type: "text",
      }]);

      const result = await adapter.parseInbound(makeJsonRequest(payload));

      expect(result).toEqual({
        tenantId: null,
        providerMessageId: "wamid.HBgNMzM2MTIzNDU2Nzg",
        from: "+33612345678",
        body: "Bonjour",
        mediaUrl: undefined,
        correlationId: "wamid.HBgNMzM2MTIzNDU2Nzg",
      });
    });

    it("should parse image message with meta-media:// prefix", async () => {
      const payload = makeMetaWebhookPayload([{
        from: "33612345678",
        id: "wamid.IMG001",
        timestamp: "1234567890",
        type: "image",
        image: { mime_type: "image/jpeg", sha256: "abc", id: "MEDIA_ID_123" },
      }]);

      const result = await adapter.parseInbound(makeJsonRequest(payload));

      expect(result.mediaUrl).toBe("meta-media://MEDIA_ID_123");
      expect(result.body).toBe("");
    });

    it("should parse button message replies with payload as interactiveReplyId", async () => {
      const payload = makeMetaWebhookPayload([{
        from: "22509542783",
        id: "wamid.BUTTON001",
        timestamp: "1234567890",
        type: "button",
        button: {
          payload: "configure_variants:ROBE1",
          text: "Variantes",
        },
      }]);

      const result = await adapter.parseInbound(makeJsonRequest(payload));

      expect(result).toEqual({
        tenantId: null,
        providerMessageId: "wamid.BUTTON001",
        from: "+22509542783",
        body: "Variantes",
        mediaUrl: undefined,
        correlationId: "wamid.BUTTON001",
        interactiveReplyId: "configure_variants:ROBE1",
      });
    });

    it("should return empty InboundMessage for status-only payload", async () => {
      const payload = makeMetaWebhookPayload([], [{
        id: "wamid.STATUS001",
        status: "delivered",
        timestamp: "1234567890",
        recipient_id: "33612345678",
      }]);

      const result = await adapter.parseInbound(makeJsonRequest(payload));

      expect(result.providerMessageId).toBe("");
      expect(result.from).toBe("");
      expect(result.body).toBe("");
    });

    it("should return empty InboundMessage for empty body", async () => {
      const req = makeJsonRequest({ object: "whatsapp_business_account", entry: [] });

      const result = await adapter.parseInbound(req);

      expect(result.providerMessageId).toBe("");
    });
  });

  // ===== AC2: parseInboundBatch =====
  describe("parseInboundBatch", () => {
    it("should parse multiple messages from one POST (batch)", async () => {
      const payload = makeMetaWebhookPayload([
        {
          from: "33612345678",
          id: "wamid.MSG1",
          timestamp: "1234567890",
          text: { body: "Premier" },
          type: "text",
        },
        {
          from: "33698765432",
          id: "wamid.MSG2",
          timestamp: "1234567891",
          text: { body: "Deuxieme" },
          type: "text",
        },
      ]);

      const results = await adapter.parseInboundBatch(makeJsonRequest(payload));

      expect(results).toHaveLength(2);
      expect(results[0]!.from).toBe("+33612345678");
      expect(results[0]!.body).toBe("Premier");
      expect(results[0]!.correlationId).toBe("wamid.MSG1");
      expect(results[1]!.from).toBe("+33698765432");
      expect(results[1]!.body).toBe("Deuxieme");
    });

    it("should return empty array for status-only payload", async () => {
      const payload = makeMetaWebhookPayload([], [{
        id: "wamid.STATUS001",
        status: "read",
        timestamp: "1234567890",
        recipient_id: "33612345678",
      }]);

      const results = await adapter.parseInboundBatch(makeJsonRequest(payload));

      expect(results).toEqual([]);
    });

    it("should skip messages with missing from field (M3)", async () => {
      const payload = makeMetaWebhookPayload([
        {
          id: "wamid.NOFROM",
          timestamp: "1234567890",
          text: { body: "No from" },
          type: "text",
        },
        {
          from: "33612345678",
          id: "wamid.VALID",
          timestamp: "1234567891",
          text: { body: "Valid" },
          type: "text",
        },
      ]);

      const results = await adapter.parseInboundBatch(makeJsonRequest(payload));

      expect(results).toHaveLength(1);
      expect(results[0]!.body).toBe("Valid");
    });

    it("should not double-prefix + if from already has it (L1)", async () => {
      const payload = makeMetaWebhookPayload([{
        from: "+33612345678",
        id: "wamid.PLUS",
        timestamp: "1234567890",
        text: { body: "Already prefixed" },
        type: "text",
      }]);

      const results = await adapter.parseInboundBatch(makeJsonRequest(payload));

      expect(results[0]!.from).toBe("+33612345678");
    });

    it("should return empty for non-whatsapp payload (L3)", async () => {
      const req = makeJsonRequest({ object: "instagram", entry: [] });

      const results = await adapter.parseInboundBatch(req);

      expect(results).toEqual([]);
    });

    it("should handle video and document media types", async () => {
      const payload = makeMetaWebhookPayload([
        {
          from: "33612345678",
          id: "wamid.VID1",
          timestamp: "1234567890",
          type: "video",
          video: { id: "VID_MEDIA_ID" },
        },
        {
          from: "33612345678",
          id: "wamid.DOC1",
          timestamp: "1234567891",
          type: "document",
          document: { id: "DOC_MEDIA_ID" },
        },
      ]);

      const results = await adapter.parseInboundBatch(makeJsonRequest(payload));

      expect(results[0]!.mediaUrl).toBe("meta-media://VID_MEDIA_ID");
      expect(results[1]!.mediaUrl).toBe("meta-media://DOC_MEDIA_ID");
    });
  });

  // ===== AC1 + AC4: send =====
  describe("send", () => {
    const mockFetch = vi.fn();

    beforeEach(() => {
      vi.stubGlobal("fetch", mockFetch);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("should send text-only message", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({
          messaging_product: "whatsapp",
          contacts: [{ input: "33612345678", wa_id: "33612345678" }],
          messages: [{ id: "wamid.SENT001" }],
        }), { status: 200 }),
      );

      const result = await adapter.send({
        tenantId: "tenant-1",
        to: "+33612345678",
        body: "Votre reservation est confirmee",
        correlationId: "corr-1",
      });

      expect(result).toEqual({
        success: true,
        providerMessageId: "wamid.SENT001",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
        expect.objectContaining({
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }),
      );

      // Verify body payload
      const callBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(callBody).toEqual({
        messaging_product: "whatsapp",
        to: "33612345678", // sans le +
        type: "text",
        text: { body: "Votre reservation est confirmee" },
      });
    });

    it("should send image message when mediaUrl is present (AC4)", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({
          messaging_product: "whatsapp",
          messages: [{ id: "wamid.MEDIA001" }],
        }), { status: 200 }),
      );

      const result = await adapter.send({
        tenantId: "tenant-1",
        to: "+33612345678",
        body: "Votre article",
        correlationId: "corr-2",
        mediaUrl: "https://example.com/photo.jpg",
      });

      expect(result).toEqual({
        success: true,
        providerMessageId: "wamid.MEDIA001",
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(callBody).toEqual({
        messaging_product: "whatsapp",
        to: "33612345678",
        type: "image",
        image: {
          link: "https://example.com/photo.jpg",
          caption: "Votre article",
        },
      });
    });

    it("should send document message when mediaUrl is a PDF (L2)", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({
          messaging_product: "whatsapp",
          messages: [{ id: "wamid.DOC001" }],
        }), { status: 200 }),
      );

      const result = await adapter.send({
        tenantId: "tenant-1",
        to: "+33612345678",
        body: "Votre facture",
        correlationId: "corr-doc",
        mediaUrl: "https://example.com/facture.pdf",
      });

      expect(result).toEqual({
        success: true,
        providerMessageId: "wamid.DOC001",
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(callBody).toEqual({
        messaging_product: "whatsapp",
        to: "33612345678",
        type: "document",
        document: {
          link: "https://example.com/facture.pdf",
          caption: "Votre facture",
        },
      });
    });

    it("should return error on HTTP failure from Meta API", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({
          error: { message: "Invalid OAuth access token", type: "OAuthException", code: 190 },
        }), { status: 401 }),
      );

      const result = await adapter.send({
        tenantId: "tenant-1",
        to: "+33612345678",
        body: "Test",
        correlationId: "corr-3",
      });

      expect(result).toEqual({
        success: false,
        error: "Invalid OAuth access token",
      });
    });

    it("sends migrated CI recipient directly for Meta delivery", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({
          messaging_product: "whatsapp",
          messages: [{ id: "wamid.CI001" }],
        }), { status: 200 }),
      );

      const result = await adapter.send({
        tenantId: "tenant-1",
        to: "+22509542783",
        body: "Test CI",
        correlationId: "corr-ci-fallback",
      });

      expect(result).toEqual({
        success: true,
        providerMessageId: "wamid.CI001",
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const callBody = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
      expect(callBody.to).toBe("2250709542783");
    });

    it("should return error when no messageId in response", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({
          messaging_product: "whatsapp",
          contacts: [],
          messages: [],
        }), { status: 200 }),
      );

      const result = await adapter.send({
        tenantId: "tenant-1",
        to: "+33612345678",
        body: "Test",
        correlationId: "corr-4",
      });

      expect(result).toEqual({
        success: false,
        error: "No message ID in Meta response",
      });
    });

    it("should return error on network exception", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await adapter.send({
        tenantId: "tenant-1",
        to: "+33612345678",
        body: "Test",
        correlationId: "corr-5",
      });

      expect(result).toEqual({
        success: false,
        error: "Network error",
      });
    });
  });
});
