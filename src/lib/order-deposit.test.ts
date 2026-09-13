import { describe, expect, it } from "vitest";
import { calculateDeposit } from "./order-deposit";
import { paymentState } from "./copy/orders";
describe("acompte", () => {
  it("calcule sur les quantités, hors livraison, et arrondit au franc", () => {
    expect(calculateDeposit(199900, 3, 30)).toEqual({ itemsTotalCents: 599700, depositPercentSnapshot: 30, depositAmountCents: 180000 });
    expect(calculateDeposit(100, 1, 30)?.depositAmountCents).toBe(100);
    expect(calculateDeposit(100, 1, 100)?.depositAmountCents).toBe(100);
  });
  it("ne fabrique aucun montant sans prix ni règle", () => {
    expect(calculateDeposit(null, 1, 30)).toBeNull();
    expect(calculateDeposit(500000, 1, null)).toBeNull();
    expect(calculateDeposit(500000, 1, 101)).toBeNull();
    expect(calculateDeposit(500000, 0, 30)).toBeNull();
  });
  it("distingue l’attente de la preuve et les décisions antérieures", () => {
    expect(paymentState({ depositStatus: "deposit_pending", proofs: [] }).key).toBe("awaiting");
    expect(paymentState({ depositStatus: "deposit_pending", proofs: [{ status: "pending" }, { status: "rejected" }] }).key).toBe("review");
    expect(paymentState({ depositStatus: "deposit_pending", proofs: [{ status: "rejected" }] }).key).toBe("rejected");
    expect(paymentState({ depositStatus: "deposit_approved", proofs: [{ status: "pending" }] }).key).toBe("approved");
    expect(paymentState({ depositStatus: "no_deposit", proofs: [] }).label).toBe("Aucun acompte requis");
  });
});
