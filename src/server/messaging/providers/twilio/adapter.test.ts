import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateRequest } from "twilio";

// Mock env so adapter can be instantiated without real env (DATABASE_URL etc.)
vi.mock("~/env", () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    TWILIO_ACCOUNT_SID: "test-sid",
    TWILIO_AUTH_TOKEN: "test-token",
    TWILIO_WHATSAPP_NUMBER: "+14155238886",
  },
}));

// Mock twilio module (Twilio must be a constructor)
vi.mock("twilio", () => ({
  validateRequest: vi.fn(),
  Twilio: class {
    messages = {
      create: vi.fn().mockResolvedValue({ sid: "SM-MOCK" }),
    };
  },
}));

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
      vi.mocked(validateRequest).mockReturnValue(true);

      const request = new Request("https://example.com/webhook", {
        method: "POST",
        headers: {
          "X-Twilio-Signature": "valid-signature",
        },
        body: "MessageSid=SM123&From=%2B1234567890&Body=Hello",
      });

      const result = await adapter.verifySignature(request, "secret");

      expect(result).toBe(true);
      expect(validateRequest).toHaveBeenCalledWith(
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
      vi.mocked(validateRequest).mockReturnValue(false);

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
      vi.mocked(validateRequest).mockReturnValue(true);

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
      expect(validateRequest).toHaveBeenCalledWith(
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
      vi.mocked(validateRequest).mockImplementation(() => {
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
});
