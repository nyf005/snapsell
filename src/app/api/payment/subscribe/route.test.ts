import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing route
vi.mock("~/server/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("~/server/db", () => ({
  db: {},
}));
vi.mock("~/server/payment/paystack", () => ({
  initializeTransaction: vi.fn(),
}));
vi.mock("~/lib/rbac", () => ({
  canManageGrid: vi.fn(),
}));
vi.mock("~/lib/subscription-plans", async () => {
  const actual = await vi.importActual("~/lib/subscription-plans");
  return {
    ...actual,
    getPaystackPlanCode: vi.fn(),
  };
});

import { POST } from "./route";
import { auth } from "~/server/auth";
import { initializeTransaction } from "~/server/payment/paystack";
import { canManageGrid } from "~/lib/rbac";
import { getPaystackPlanCode } from "~/lib/subscription-plans";

describe("Story 7A.2: POST /api/payment/subscribe", () => {
  const mockSession = {
    user: {
      id: "user-1",
      email: "owner@test.com",
      tenantId: "tenant-1",
      role: "OWNER",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue(mockSession as never);
    vi.mocked(canManageGrid).mockReturnValue(true);
    vi.mocked(initializeTransaction).mockResolvedValue({
      status: true,
      message: "Authorization URL created",
      data: {
        authorization_url: "https://checkout.paystack.com/xxx",
        access_code: "acc_xxx",
        reference: "ref-123",
      },
    });
    vi.mocked(getPaystackPlanCode).mockImplementation((plan) => {
      if (plan.id === "starter") return "PLN_starter";
      if (plan.id === "pro") return "PLN_pro";
      return null;
    });
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const req = new Request("http://localhost/api/payment/subscribe", {
      method: "POST",
      body: JSON.stringify({ plan: "starter" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not OWNER/MANAGER", async () => {
    vi.mocked(canManageGrid).mockReturnValue(false);

    const req = new Request("http://localhost/api/payment/subscribe", {
      method: "POST",
      body: JSON.stringify({ plan: "starter" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid plan", async () => {
    const req = new Request("http://localhost/api/payment/subscribe", {
      method: "POST",
      body: JSON.stringify({ plan: "invalid" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for free plan", async () => {
    const req = new Request("http://localhost/api/payment/subscribe", {
      method: "POST",
      body: JSON.stringify({ plan: "free" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("initializes Paystack transaction for starter and returns authorization URL", async () => {
    const req = new Request("http://localhost/api/payment/subscribe", {
      method: "POST",
      body: JSON.stringify({ plan: "starter" }),
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.authorization_url).toBe("https://checkout.paystack.com/xxx");
    expect(data.reference).toBe("ref-123");

    expect(initializeTransaction).toHaveBeenCalledWith(
      "owner@test.com",
      "PLN_starter",
      expect.objectContaining({ tenantId: "tenant-1", plan: "starter" }),
      expect.stringContaining("/parametres/abonnement?payment=callback"),
      2_500_000,
      "XOF",
    );
  });

  it("initializes Paystack transaction for pro plan", async () => {
    const req = new Request("http://localhost/api/payment/subscribe", {
      method: "POST",
      body: JSON.stringify({ plan: "pro" }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(initializeTransaction).toHaveBeenCalledWith(
      "owner@test.com",
      "PLN_pro",
      expect.objectContaining({ plan: "pro" }),
      expect.any(String),
      5_000_000,
      "XOF",
    );
  });

  it("returns 500 when Paystack fails", async () => {
    vi.mocked(initializeTransaction).mockRejectedValue(new Error("Network error"));

    const req = new Request("http://localhost/api/payment/subscribe", {
      method: "POST",
      body: JSON.stringify({ plan: "starter" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
