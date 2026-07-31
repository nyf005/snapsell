/**
 * Le lien de support est la seule porte d'une vendeuse bloquée. Deux choses ne
 * doivent jamais casser : qu'il mène quelque part, et qu'il emporte le contexte.
 */

import { describe, expect, it } from "vitest";

import {
  buildSupportHref,
  buildSupportMessage,
  isDirectSupport,
} from "./support";

describe("buildSupportMessage", () => {
  it("reste utilisable sans aucun contexte", () => {
    expect(buildSupportMessage()).toContain("besoin d'aide");
  });

  it("emporte la boutique, la page et la référence", () => {
    const message = buildSupportMessage({
      shopName: "Chez Awa",
      screen: "/dashboard/live",
      reference: "A1B2C3",
    });

    expect(message).toContain("Chez Awa");
    expect(message).toContain("/dashboard/live");
    expect(message).toContain("A1B2C3");
  });

  /** Un champ vide ne doit pas laisser une ligne « Référence : » orpheline. */
  it("omet les lignes dont on n'a pas la valeur", () => {
    const message = buildSupportMessage({ shopName: "Chez Awa" });

    expect(message).toContain("Chez Awa");
    expect(message).not.toContain("Référence");
    expect(message).not.toContain("Page");
  });

  /** La vendeuse doit pouvoir écrire à la suite, pas effacer un pavé. */
  it("se termine par une invite à décrire le problème", () => {
    expect(buildSupportMessage()).toMatch(/Ce qui se passe :$/);
  });
});

describe("buildSupportHref", () => {
  it("ouvre une conversation WhatsApp quand le numéro est configuré", () => {
    const href = buildSupportHref("2250701020304", { shopName: "Chez Awa" });

    expect(href.startsWith("https://wa.me/2250701020304")).toBe(true);
    expect(href).toContain("text=");
  });

  it("encode le message, sauts de ligne compris", () => {
    const href = buildSupportHref("2250701020304", { reference: "A1B2C3" });

    // Décodé, on doit retrouver le message tel quel — un lien mal encodé
    // tronque le contexte au premier saut de ligne.
    const text = decodeURIComponent(href.split("text=")[1] ?? "");
    expect(text).toContain("A1B2C3");
    expect(text).toContain("\n");
  });

  /**
   * Le cas qui compte le jour où le numéro n'est pas encore acquis : renvoyer
   * vers le centre d'aide plutôt que vers `https://wa.me/undefined`.
   */
  it("renvoie au centre d'aide tant qu'aucun numéro n'est configuré", () => {
    expect(buildSupportHref(undefined, { shopName: "Chez Awa" })).toBe("/aide");
    expect(buildSupportHref("", {})).toBe("/aide");
  });
});

describe("isDirectSupport", () => {
  it.each([
    ["2250701020304", true],
    [undefined, false],
    ["", false],
  ])("pour %s rend %s", (numero, attendu) => {
    expect(isDirectSupport(numero)).toBe(attendu);
  });
});
