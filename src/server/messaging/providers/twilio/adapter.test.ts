import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock env so adapter can be instantiated without real env (DATABASE_URL etc.)
vi.mock("~/env", () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    TWILIO_ACCOUNT_SID: "test-sid",
    TWILIO_AUTH_TOKEN: "test-token",
    TWILIO_WHATSAPP_NUMBER: "+14155238886",
  },
}));

// Mock twilio module: default export for ESM compatibility (adapter uses import twilio from "twilio")
vi.mock("twilio", () => {
  const validateRequest = vi.fn();
  const Twilio = class {
    messages = {
      create: vi.fn().mockResolvedValue({ sid: "SM-MOCK" }),
    };
  };
  return {
    __esModule: true,
    default: { validateRequest, Twilio },
    validateRequest,
    Twilio,
  };
});

import twilio from "twilio";
import { TwilioAdapter } from "./adapter";

describe("TwilioAdapter", () => {
  const authToken = "test-auth-token";
  let adapter: TwilioAdapter;

  beforeEach(() => {
    adapter = new TwilioAdapter(authToken);
    vi.clearAllMocks();
  });

  describe("verifySignature", () => {
    it("should return false if X-Twilio-Signature header is missing", async () => {
      const request = new Request("https://example.com/webhook", {
        method: "POST",
        headers: {},
      });

      const result = await adapter.verifySignature(request, "secret");

      expect(result).toBe(false);
    });

    it("should return true if signature is valid", async () => {
      vi.mocked(twilio.validateRequest).mockReturnValue(true);

      const request = new Request("https://example.com/webhook", {
        method: "POST",
        headers: {
          "X-Twilio-Signature": "valid-signature",
        },
        body: "MessageSid=SM123&From=%2B1234567890&Body=Hello",
      });

      const result = await adapter.verifySignature(request, "secret");

      expect(result).toBe(true);
      expect(twilio.validateRequest).toHaveBeenCalledWith(
        authToken,
        "valid-signature",
        expect.stringContaining("https://example.com/webhook"),
        expect.objectContaining({
          MessageSid: "SM123",
          From: "+1234567890",
          Body: "Hello",
        }),
      );
    });

    it("should return false if signature is invalid", async () => {
      vi.mocked(twilio.validateRequest).mockReturnValue(false);

      const request = new Request("https://example.com/webhook", {
        method: "POST",
        headers: {
          "X-Twilio-Signature": "invalid-signature",
        },
        body: "MessageSid=SM123&From=%2B1234567890",
      });

      const result = await adapter.verifySignature(request, "secret");

      expect(result).toBe(false);
    });

    it("should use provided bodyText and fullUrl if available", async () => {
      vi.mocked(twilio.validateRequest).mockReturnValue(true);

      const request = new Request("https://example.com/webhook", {
        method: "POST",
        headers: {
          "X-Twilio-Signature": "valid-signature",
        },
      });

      const bodyText = "MessageSid=SM456&From=%2B9876543210";
      const fullUrl = "https://custom-url.com/webhook";

      const result = await adapter.verifySignature(
        request,
        "secret",
        bodyText,
        fullUrl,
      );

      expect(result).toBe(true);
      expect(twilio.validateRequest).toHaveBeenCalledWith(
        authToken,
        "valid-signature",
        fullUrl,
        expect.objectContaining({
          MessageSid: "SM456",
          From: "+9876543210",
        }),
      );
    });

    it("should return false on error", async () => {
      vi.mocked(twilio.validateRequest).mockImplementation(() => {
        throw new Error("Validation error");
      });

      const request = new Request("https://example.com/webhook", {
        method: "POST",
        headers: {
          "X-Twilio-Signature": "valid-signature",
        },
        body: "MessageSid=SM123",
      });

      const result = await adapter.verifySignature(request, "secret");

      expect(result).toBe(false);
    });
  });

  describe("parseInboundFromUrlSearchParams", () => {
    it("should parse valid Twilio webhook payload", () => {
      const params = new URLSearchParams({
        MessageSid: "SM1234567890abcdef",
        From: "whatsapp:+1234567890",
        Body: "Hello World",
        To: "whatsapp:+0987654321",
        AccountSid: "AC1234567890abcdef",
      });

      const result = adapter.parseInboundFromUrlSearchParams(params);

      expect(result).toMatchObject({
        tenantId: null, // Will be resolved in route
        providerMessageId: "SM1234567890abcdef",
        from: "whatsapp:+1234567890",
        body: "Hello World",
        correlationId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        ),
      });
      expect(result.mediaUrl).toBeUndefined();
    });

    it("should extract mediaUrl if present", () => {
      const params = new URLSearchParams({
        MessageSid: "SM1234567890abcdef",
        From: "whatsapp:+1234567890",
        Body: "Check this image",
        To: "whatsapp:+0987654321",
        NumMedia: "1",
        MediaUrl0: "https://example.com/media/image.jpg",
      });

      const result = adapter.parseInboundFromUrlSearchParams(params);

      expect(result.mediaUrl).toBe("https://example.com/media/image.jpg");
    });

    it("should handle empty body", () => {
      const params = new URLSearchParams({
        MessageSid: "SM1234567890abcdef",
        From: "whatsapp:+1234567890",
        To: "whatsapp:+0987654321",
      });

      const result = adapter.parseInboundFromUrlSearchParams(params);

      expect(result.body).toBe("");
    });

    it("should generate unique correlationId for each message", () => {
      const params = new URLSearchParams({
        MessageSid: "SM1234567890abcdef",
        From: "whatsapp:+1234567890",
        Body: "Message 1",
        To: "whatsapp:+0987654321",
      });

      const result1 = adapter.parseInboundFromUrlSearchParams(params);
      const result2 = adapter.parseInboundFromUrlSearchParams(params);

      expect(result1.correlationId).not.toBe(result2.correlationId);
    });
  });

  describe("parseInbound", () => {
    it("should parse FormData and return normalized message", async () => {
      const formData = new FormData();
      formData.append("MessageSid", "SM1234567890abcdef");
      formData.append("From", "whatsapp:+1234567890");
      formData.append("Body", "Hello World");
      formData.append("To", "whatsapp:+0987654321");

      const request = new Request("https://example.com/webhook", {
        method: "POST",
        body: formData,
      });

      const result = await adapter.parseInbound(request);

      expect(result).toMatchObject({
        tenantId: null,
        providerMessageId: "SM1234567890abcdef",
        from: "whatsapp:+1234567890",
        body: "Hello World",
        correlationId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        ),
      });
    });
  });

  describe("send", () => {
    it("should send text-only message when no mediaUrl", async () => {
      const result = await adapter.send({
        tenantId: "t1",
        to: "+2250101020304",
        body: "Hello",
        correlationId: "corr-1",
      });

      expect(result).toEqual({ success: true, providerMessageId: "SM-MOCK" });
      // Access internal client mock
      const clientMessages = (adapter as unknown as { client: { messages: { create: ReturnType<typeof vi.fn> } } }).client.messages;
      expect(clientMessages.create).toHaveBeenCalledWith({
        from: "whatsapp:+14155238886",
        to: "whatsapp:+2250101020304",
        body: "Hello",
      });
    });

    it("Story 9.4: should send message with mediaUrl when provided (AC #6)", async () => {
      const result = await adapter.send({
        tenantId: "t1",
        to: "+2250101020304",
        body: "Récap",
        correlationId: "corr-2",
        mediaUrl: "https://r2.example.com/signed-url",
      });

      expect(result).toEqual({ success: true, providerMessageId: "SM-MOCK" });
      const clientMessages = (adapter as unknown as { client: { messages: { create: ReturnType<typeof vi.fn> } } }).client.messages;
      expect(clientMessages.create).toHaveBeenCalledWith({
        from: "whatsapp:+14155238886",
        to: "whatsapp:+2250101020304",
        body: "Récap",
        mediaUrl: ["https://r2.example.com/signed-url"],
      });
    });

    it("Story 9.4: should NOT include mediaUrl array when mediaUrl is undefined (AC #7)", async () => {
      await adapter.send({
        tenantId: "t1",
        to: "+2250101020304",
        body: "Text only",
        correlationId: "corr-3",
      });

      const clientMessages = (adapter as unknown as { client: { messages: { create: ReturnType<typeof vi.fn> } } }).client.messages;
      const callArgs = clientMessages.create.mock.calls[0]?.[0];
      expect(callArgs).not.toHaveProperty("mediaUrl");
    });

    it("should return error on Twilio failure", async () => {
      const clientMessages = (adapter as unknown as { client: { messages: { create: ReturnType<typeof vi.fn> } } }).client.messages;
      clientMessages.create.mockRejectedValueOnce(new Error("Twilio down"));

      const result = await adapter.send({
        tenantId: "t1",
        to: "+2250101020304",
        body: "Fail",
        correlationId: "corr-4",
      });

      expect(result).toEqual({ success: false, error: "Twilio down" });
    });
  });
});
