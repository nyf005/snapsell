import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

const MOCK_SECRET = "sk_test_webhook";

// Mocks
vi.mock("~/server/db", () => ({
  db: {
    subscriptionPayment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("~/server/payment/paystack", () => ({
  verifyWebhookSignature: vi.fn(),
}));

import { POST } from "./route";
import { db } from "~/server/db";
import { verifyWebhookSignature } from "~/server/payment/paystack";

function makeSignature(body: string): string {
  return createHmac("sha512", MOCK_SECRET).update(body).digest("hex");
}

function makeRequest(body: object, signature?: string): Request {
  const bodyStr = JSON.stringify(body);
  return new Request("http://localhost/api/webhooks/paystack", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-paystack-signature": signature ?? makeSignature(bodyStr),
    },
    body: bodyStr,
  });
}

describe("Story 7A.2: Paystack Webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyWebhookSignature).mockReturnValue(true);
    vi.mocked(db.subscriptionPayment.findUnique).mockResolvedValue(null);
    vi.mocked(db.subscriptionPayment.findFirst).mockResolvedValue(null);
    vi.mocked(db.subscriptionPayment.update).mockResolvedValue({} as never);
    vi.mocked(db.subscriptionPayment.create).mockResolvedValue({} as never);
    vi.mocked(db.tenant.findUnique).mockResolvedValue(null);
    vi.mocked(db.tenant.update).mockResolvedValue({} as never);
  });

  it("always returns 200 OK", async () => {
    const body = { event: "unknown_event", data: {} };
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
  });

  it("returns 200 even with invalid signature", async () => {
    vi.mocked(verifyWebhookSignature).mockReturnValue(false);

    const body = { event: "charge.success", data: {} };
    const res = await POST(makeRequest(body, "invalid"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("invalid_signature");
  });

  describe("charge.success", () => {
    const chargeEvent = {
      event: "charge.success",
      data: {
        reference: "ref-123",
        status: "success",
        amount: 2500000, // 25000 FCFA in kobo
        currency: "NGN",
        channel: "card",
        metadata: {
          tenantId: "tenant-1",
          plan: "starter",
          userId: "user-1",
        },
        customer: {
          customer_code: "CUS_xxx",
          email: "test@example.com",
        },
        authorization: {
          authorization_code: "AUTH_xxx",
          last4: "4081",
          channel: "card",
        },
      },
    };

    it("creates SubscriptionPayment and updates Tenant entitlements", async () => {
      const res = await POST(makeRequest(chargeEvent));
      expect(res.status).toBe(200);

      // No existing by ref → no pending found → create
      expect(db.subscriptionPayment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: "tenant-1",
          paystackReference: "ref-123",
          type: "subscription",
          plan: "starter",
          amount: 25000,
          status: "success",
          channel: "card",
          cardLast4: "4081",
        }),
      });

      // Tenant updated with Starter entitlements
      expect(db.tenant.update).toHaveBeenCalledWith({
        where: { id: "tenant-1" },
        data: expect.objectContaining({
          subscriptionPlan: "starter",
          creditsBalance: 500,
          hasAI: true,
        }),
      });
    });

    it("is idempotent — skips if payment already success", async () => {
      vi.mocked(db.subscriptionPayment.findUnique).mockResolvedValue({
        status: "success",
      } as never);

      const res = await POST(makeRequest(chargeEvent));
      expect(res.status).toBe(200);
      expect(db.subscriptionPayment.update).not.toHaveBeenCalled();
      expect(db.subscriptionPayment.create).not.toHaveBeenCalled();
      expect(db.tenant.update).not.toHaveBeenCalled();
    });

    it("skips tenant update if no plan in metadata", async () => {
      const event = {
        ...chargeEvent,
        data: {
          ...chargeEvent.data,
          metadata: { tenantId: "tenant-1" },
        },
      };

      const res = await POST(makeRequest(event));
      expect(res.status).toBe(200);
      expect(db.subscriptionPayment.create).toHaveBeenCalled();
      // tenant.update NOT called (no plan to apply)
      expect(db.tenant.update).not.toHaveBeenCalled();
    });

    it("does nothing if no tenantId in metadata", async () => {
      const event = {
        ...chargeEvent,
        data: { ...chargeEvent.data, metadata: {} },
      };

      const res = await POST(makeRequest(event));
      expect(res.status).toBe(200);
      expect(db.subscriptionPayment.create).not.toHaveBeenCalled();
      expect(db.subscriptionPayment.update).not.toHaveBeenCalled();
    });
  });

  describe("subscription.create", () => {
    it("stores subscription codes on Tenant", async () => {
      const event = {
        event: "subscription.create",
        data: {
          subscription_code: "SUB_xxx",
          email_token: "tok_xxx",
          metadata: { tenantId: "tenant-1" },
          customer: { customer_code: "CUS_xxx" },
          authorization: { authorization_code: "AUTH_xxx" },
        },
      };

      const res = await POST(makeRequest(event));
      expect(res.status).toBe(200);

      expect(db.tenant.update).toHaveBeenCalledWith({
        where: { id: "tenant-1" },
        data: expect.objectContaining({
          paystackSubscriptionCode: "SUB_xxx",
          paystackEmailToken: "tok_xxx",
          paystackCustomerCode: "CUS_xxx",
          paystackAuthorizationCode: "AUTH_xxx",
        }),
      });
    });
  });

  describe("invoice.payment_failed", () => {
    it("sets subscription status to attention via tenantId", async () => {
      const event = {
        event: "invoice.payment_failed",
        data: {
          metadata: { tenantId: "tenant-1" },
        },
      };

      const res = await POST(makeRequest(event));
      expect(res.status).toBe(200);
      expect(db.tenant.update).toHaveBeenCalledWith({
        where: { id: "tenant-1" },
        data: { subscriptionStatus: "attention" },
      });
    });

    it("finds tenant by subscription code if no tenantId", async () => {
      vi.mocked(db.tenant.findUnique).mockResolvedValue({ id: "tenant-1" } as never);

      const event = {
        event: "invoice.payment_failed",
        data: {
          subscription_code: "SUB_xxx",
        },
      };

      const res = await POST(makeRequest(event));
      expect(res.status).toBe(200);
      expect(db.tenant.findUnique).toHaveBeenCalledWith({
        where: { paystackSubscriptionCode: "SUB_xxx" },
        select: { id: true },
      });
      expect(db.tenant.update).toHaveBeenCalledWith({
        where: { id: "tenant-1" },
        data: { subscriptionStatus: "attention" },
      });
    });
  });

  describe("subscription.disable", () => {
    it("downgrades to Free plan", async () => {
      vi.mocked(db.tenant.findUnique).mockResolvedValue({ id: "tenant-1" } as never);

      const event = {
        event: "subscription.disable",
        data: { subscription_code: "SUB_xxx" },
      };

      const res = await POST(makeRequest(event));
      expect(res.status).toBe(200);
      expect(db.tenant.update).toHaveBeenCalledWith({
        where: { id: "tenant-1" },
        data: expect.objectContaining({
          subscriptionStatus: "cancelled",
          subscriptionPlan: "free",
          creditsBalance: 70,
          creditsTotalMonthly: 70,
          maxAgents: 0,
        }),
      });
    });
  });

  describe("subscription.not_renew", () => {
    it("sets status to non_renewing (access until expiry)", async () => {
      vi.mocked(db.tenant.findUnique).mockResolvedValue({ id: "tenant-1" } as never);

      const event = {
        event: "subscription.not_renew",
        data: { subscription_code: "SUB_xxx" },
      };

      const res = await POST(makeRequest(event));
      expect(res.status).toBe(200);
      expect(db.tenant.update).toHaveBeenCalledWith({
        where: { id: "tenant-1" },
        data: { subscriptionStatus: "non_renewing" },
      });
    });
  });
});
