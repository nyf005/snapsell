import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";
import {
  initializeTransaction,
  verifyWebhookSignature,
  getSubscription,
  disableSubscription,
  generateManageLink,
  chargeAuthorization,
} from "./paystack";

const MOCK_SECRET_KEY = "sk_test_xxx";

describe("Story 7A.2: Paystack service", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.PAYSTACK_SECRET_KEY;
    process.env.PAYSTACK_SECRET_KEY = MOCK_SECRET_KEY;
  });

  afterEach(() => {
    process.env.PAYSTACK_SECRET_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  describe("verifyWebhookSignature", () => {
    it("returns true for valid HMAC SHA-512 signature", () => {
      const body = '{"event":"charge.success","data":{}}';
      const hash = createHmac("sha512", MOCK_SECRET_KEY).update(body).digest("hex");

      expect(verifyWebhookSignature(body, hash)).toBe(true);
    });

    it("returns false for invalid signature", () => {
      const body = '{"event":"charge.success","data":{}}';
      expect(verifyWebhookSignature(body, "invalid-signature")).toBe(false);
    });

    it("returns false for tampered body", () => {
      const body = '{"event":"charge.success","data":{}}';
      const hash = createHmac("sha512", MOCK_SECRET_KEY).update(body).digest("hex");
      const tamperedBody = '{"event":"charge.success","data":{"tampered":true}}';

      expect(verifyWebhookSignature(tamperedBody, hash)).toBe(false);
    });

    it("throws when PAYSTACK_SECRET_KEY is not set", () => {
      delete process.env.PAYSTACK_SECRET_KEY;
      expect(() => verifyWebhookSignature("body", "sig")).toThrow(
        "PAYSTACK_SECRET_KEY is not configured",
      );
    });
  });

  describe("initializeTransaction", () => {
    it("calls Paystack API with correct params and returns response", async () => {
      const mockResponse = {
        status: true,
        message: "Authorization URL created",
        data: {
          authorization_url: "https://checkout.paystack.com/xxx",
          access_code: "abc123",
          reference: "ref-123",
        },
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await initializeTransaction(
        "test@example.com",
        "PLN_starter",
        { tenantId: "t1", plan: "starter" },
        "https://app.test/parametres/abonnement?payment=callback",
        2_500_000,
        "XOF",
      );

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        "https://api.paystack.co/transaction/initialize",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: `Bearer ${MOCK_SECRET_KEY}`,
          }),
        }),
      );

      // Verify body contents (amount in subunits for XOF)
      const callArgs = vi.mocked(fetch).mock.calls[0]!;
      const body = JSON.parse(callArgs[1]!.body as string);
      expect(body.email).toBe("test@example.com");
      expect(body.plan).toBe("PLN_starter");
      expect(body.amount).toBe(2_500_000);
      expect(body.currency).toBe("XOF");
      expect(body.callback_url).toBe(
        "https://app.test/parametres/abonnement?payment=callback",
      );
      expect(body.metadata).toEqual({ tenantId: "t1", plan: "starter" });
    });

    it("throws on non-OK response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Bad request", { status: 400 }),
      );

      await expect(
        initializeTransaction("test@example.com", "PLN_xxx", {}, "https://cb", 1000),
      ).rejects.toThrow("Paystack initializeTransaction failed: 400");
    });
  });

  describe("getSubscription", () => {
    it("fetches subscription by code", async () => {
      const mockData = {
        status: true,
        message: "Subscription retrieved",
        data: {
          id: 1,
          status: "active",
          subscription_code: "SUB_xxx",
          email_token: "tok_xxx",
          next_payment_date: "2026-03-09T00:00:00.000Z",
          plan: { plan_code: "PLN_xxx", name: "Starter" },
          authorization: { authorization_code: "AUTH_xxx", last4: "4081", channel: "card" },
          customer: { customer_code: "CUS_xxx", email: "test@example.com" },
        },
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockData), { status: 200 }),
      );

      const result = await getSubscription("SUB_xxx");
      expect(result.data.subscription_code).toBe("SUB_xxx");
      expect(fetch).toHaveBeenCalledWith(
        "https://api.paystack.co/subscription/SUB_xxx",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${MOCK_SECRET_KEY}`,
          }),
        }),
      );
    });
  });

  describe("disableSubscription", () => {
    it("sends disable request with code and token", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ status: true, message: "Subscription disabled" }), {
          status: 200,
        }),
      );

      const result = await disableSubscription("SUB_xxx", "tok_xxx");
      expect(result.status).toBe(true);

      const callArgs = vi.mocked(fetch).mock.calls[0]!;
      const body = JSON.parse(callArgs[1]!.body as string);
      expect(body.code).toBe("SUB_xxx");
      expect(body.token).toBe("tok_xxx");
    });
  });

  describe("generateManageLink", () => {
    it("returns manage link for subscription", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: true,
            message: "Link generated",
            data: { link: "https://paystack.com/manage/xxx" },
          }),
          { status: 200 },
        ),
      );

      const result = await generateManageLink("SUB_xxx");
      expect(result.data.link).toBe("https://paystack.com/manage/xxx");
    });
  });

  describe("chargeAuthorization", () => {
    it("charges stored card with authorization code", async () => {
      const mockResponse = {
        status: true,
        message: "Charge attempted",
        data: {
          reference: "ref-overage-123",
          status: "success",
          amount: 90000,
          currency: "NGN",
        },
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 }),
      );

      const result = await chargeAuthorization("AUTH_xxx", "test@example.com", 90000);
      expect(result.data.status).toBe("success");

      const callArgs = vi.mocked(fetch).mock.calls[0]!;
      const body = JSON.parse(callArgs[1]!.body as string);
      expect(body.authorization_code).toBe("AUTH_xxx");
      expect(body.email).toBe("test@example.com");
      expect(body.amount).toBe(90000);
    });

    it("throws on Paystack error", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Insufficient funds", { status: 400 }),
      );

      await expect(
        chargeAuthorization("AUTH_xxx", "test@example.com", 90000),
      ).rejects.toThrow("Paystack chargeAuthorization failed: 400");
    });
  });
});
