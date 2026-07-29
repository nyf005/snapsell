import { describe, expect, it } from "vitest";

import { isSellerHelpRequest } from "./seller-help";
import { parseSellerCreateItemIntent } from "~/server/catalogue/sellerCreateIntent";

describe("isSellerHelpRequest", () => {
  it.each(["aide", "AIDE", "  aide  ", "Aide", "help", "?", "aide ?"])(
    "reconnaît « %s »",
    (body) => {
      expect(isSellerHelpRequest(body)).toBe(true);
    },
  );

  it.each([
    "A12",
    "A12 x3",
    "ajout A12",
    "aide pour A12",
    "j’ai besoin d’aide",
    "aidez-moi",
    "",
    "  ",
  ])("ne reconnaît pas « %s »", (body) => {
    expect(isSellerHelpRequest(body)).toBe(false);
  });

  it("ne détourne aucun code que le parsing d’articles reconnaîtrait", () => {
    // La garde qui compte : l'aide est branchée AVANT le parsing d'intention. Si son
    // motif attrapait un code, ce code ne créerait plus d'article — une vente perdue
    // en pleine diffusion, sans message d'erreur pour l'expliquer.
    const codes = ["A12", "A12 x3", "AB7", "PREMIUM42", "B7x2"];
    for (const code of codes) {
      expect(parseSellerCreateItemIntent(code), code).not.toBeNull();
      expect(isSellerHelpRequest(code), code).toBe(false);
    }
  });
});
