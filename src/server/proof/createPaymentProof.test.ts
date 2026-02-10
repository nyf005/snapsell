/**
 * Story 5.3: Tests pour createPaymentProof.
 * - Retourne null si commande absente ou pas en deposit_pending, ou payload vide.
 * - Crée une preuve et retourne { id } avec textPayload et/ou mediaStorageKey.
 * - Story 7A.2: Lance ProofsQuotaExceededError si quota preuves atteint.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPaymentProof, ProofsQuotaExceededError } from "./createPaymentProof";

const mockOrderFindFirst = vi.hoisted(() => vi.fn());
const mockPaymentProofCreate = vi.hoisted(() => vi.fn());
const mockCheckProofsQuota = vi.hoisted(() => vi.fn());

vi.mock("~/server/db", () => ({
  db: {
    order: { findFirst: mockOrderFindFirst },
    paymentProof: { create: mockPaymentProofCreate },
  },
}));

vi.mock("~/server/subscription/usage", () => ({
  checkProofsQuota: (...args: unknown[]) => mockCheckProofsQuota(...args),
}));

describe("createPaymentProof", () => {
  const tenantId = "tenant-1";
  const orderId = "order-1";
  const correlationId = "corr-1";

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckProofsQuota.mockResolvedValue({
      allowed: true,
      currentUsage: 0,
      quota: 20,
    });
  });

  it("throws ProofsQuotaExceededError when proofs quota exceeded", async () => {
    mockCheckProofsQuota.mockResolvedValueOnce({
      allowed: false,
      currentUsage: 20,
      quota: 20,
    });

    await expect(
      createPaymentProof(
        tenantId,
        orderId,
        { textPayload: "Preuve" },
        correlationId,
      ),
    ).rejects.toThrow(ProofsQuotaExceededError);

    expect(mockOrderFindFirst).not.toHaveBeenCalled();
    expect(mockPaymentProofCreate).not.toHaveBeenCalled();
  });

  it("returns null when order not found", async () => {
    mockOrderFindFirst.mockResolvedValue(null);

    const result = await createPaymentProof(
      tenantId,
      orderId,
      { textPayload: "Preuve" },
      correlationId,
    );

    expect(result).toBeNull();
    expect(mockPaymentProofCreate).not.toHaveBeenCalled();
  });

  it("returns null when order is not in deposit_pending", async () => {
    mockOrderFindFirst.mockResolvedValue({
      id: orderId,
      tenantId,
      depositStatus: "deposit_approved",
    });

    const result = await createPaymentProof(
      tenantId,
      orderId,
      { textPayload: "Preuve" },
      correlationId,
    );

    expect(result).toBeNull();
    expect(mockPaymentProofCreate).not.toHaveBeenCalled();
  });

  it("returns null when payload has neither mediaStorageKey nor textPayload", async () => {
    mockOrderFindFirst.mockResolvedValue({
      id: orderId,
      tenantId,
      depositStatus: "deposit_pending",
    });

    const result = await createPaymentProof(
      tenantId,
      orderId,
      {},
      correlationId,
    );

    expect(result).toBeNull();
    expect(mockPaymentProofCreate).not.toHaveBeenCalled();
  });

  it("creates proof with textPayload and returns id", async () => {
    mockOrderFindFirst.mockResolvedValue({
      id: orderId,
      tenantId,
      depositStatus: "deposit_pending",
    });
    mockPaymentProofCreate.mockResolvedValue({
      id: "proof-1",
      orderId,
      tenantId,
      textPayload: "Preuve texte",
      mediaStorageKey: null,
      status: "pending",
      correlationId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await createPaymentProof(
      tenantId,
      orderId,
      { textPayload: "Preuve texte" },
      correlationId,
    );

    expect(result).toEqual({ id: "proof-1" });
    expect(mockPaymentProofCreate).toHaveBeenCalledWith({
      data: {
        orderId,
        tenantId,
        mediaStorageKey: null,
        textPayload: "Preuve texte",
        status: "pending",
        correlationId,
      },
    });
  });

  it("creates proof with mediaStorageKey and returns id", async () => {
    mockOrderFindFirst.mockResolvedValue({
      id: orderId,
      tenantId,
      depositStatus: "deposit_pending",
    });
    mockPaymentProofCreate.mockResolvedValue({
      id: "proof-2",
      orderId,
      tenantId,
      textPayload: null,
      mediaStorageKey: "tenants/t1/proofs/order-1/media",
      status: "pending",
      correlationId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await createPaymentProof(
      tenantId,
      orderId,
      { mediaStorageKey: "tenants/t1/proofs/order-1/media" },
      correlationId,
    );

    expect(result).toEqual({ id: "proof-2" });
    expect(mockPaymentProofCreate).toHaveBeenCalledWith({
      data: {
        orderId,
        tenantId,
        mediaStorageKey: "tenants/t1/proofs/order-1/media",
        textPayload: null,
        status: "pending",
        correlationId,
      },
    });
  });

  it("creates proof with both textPayload and mediaStorageKey", async () => {
    mockOrderFindFirst.mockResolvedValue({
      id: orderId,
      tenantId,
      depositStatus: "deposit_pending",
    });
    mockPaymentProofCreate.mockResolvedValue({
      id: "proof-3",
      orderId,
      tenantId,
      textPayload: "Voir photo",
      mediaStorageKey: "key",
      status: "pending",
      correlationId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await createPaymentProof(
      tenantId,
      orderId,
      { textPayload: "Voir photo", mediaStorageKey: "key" },
      correlationId,
    );

    expect(result).toEqual({ id: "proof-3" });
    expect(mockPaymentProofCreate).toHaveBeenCalledWith({
      data: {
        orderId,
        tenantId,
        mediaStorageKey: "key",
        textPayload: "Voir photo",
        status: "pending",
        correlationId,
      },
    });
  });
});
