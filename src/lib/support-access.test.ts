import { describe, expect, it } from "vitest";

import { isWhatsAppSupportEmail } from "./support-access";

describe("isWhatsAppSupportEmail", () => {
  it("reconnaît une adresse autorisée sans dépendre de la casse ni des espaces", () => {
    expect(
      isWhatsAppSupportEmail(
        "Support@SnapSell.ci",
        " admin@snapsell.ci, support@snapsell.ci ",
      ),
    ).toBe(true);
  });

  it("refuse une boutique ordinaire et une liste absente", () => {
    expect(isWhatsAppSupportEmail("boutique@example.com", "support@snapsell.ci")).toBe(false);
    expect(isWhatsAppSupportEmail("support@snapsell.ci", undefined)).toBe(false);
  });
});
