import { describe, expect, it } from "vitest";

import { createInvitationInputSchema } from "~/server/api/routers/invitations.schema";
import { loginInputSchema } from "./login";
import { signupInputSchema } from "./signup";

/**
 * Garde-fou : toute adresse email entre dans le produit en minuscules.
 *
 * `createInvitationInputSchema` normalisait déjà ; `signupInputSchema` et
 * `loginInputSchema` non. Le décalage se voyait mal — trois fichiers, une seule
 * ligne d'écart — et ses effets étaient silencieux : un compte créé avec
 * « Awa@boutique.ci » restait introuvable à la connexion en « awa@boutique.ci »,
 * et une seconde inscription à la casse près passait la contrainte d'unicité.
 *
 * Le test porte sur les **schémas** et non sur les appelants, parce que c'est le
 * seul point de passage commun : `loginInputSchema` sert au formulaire comme à
 * `authorize()`, `signupInputSchema` au formulaire comme au routeur tRPC.
 * Un nouveau schéma qui accepte une adresse doit être ajouté ici.
 */

const SCHEMAS_ACCEPTING_EMAIL = [
  ["signupInputSchema", (email: string) => signupInputSchema.parse({
    email,
    password: "password123",
    tenantName: "Ma boutique",
  }).email],
  ["loginInputSchema", (email: string) => loginInputSchema.parse({
    email,
    password: "password123",
  }).email],
  ["createInvitationInputSchema", (email: string) =>
    createInvitationInputSchema.parse({ email }).email],
] as const;

describe("normalisation des emails", () => {
  for (const [name, parseEmail] of SCHEMAS_ACCEPTING_EMAIL) {
    describe(name, () => {
      it("met l'adresse en minuscules", () => {
        expect(parseEmail("Awa@Boutique.CI")).toBe("awa@boutique.ci");
      });

      it("retire les espaces autour", () => {
        expect(parseEmail("  awa@boutique.ci  ")).toBe("awa@boutique.ci");
      });

      it("laisse intacte une adresse déjà normalisée", () => {
        expect(parseEmail("awa@boutique.ci")).toBe("awa@boutique.ci");
      });
    });
  }

  /**
   * L'invariant qui compte réellement : deux saisies de la même adresse, quelle
   * que soit la porte d'entrée, doivent produire exactement la même chaîne —
   * sans quoi l'une crée un compte que l'autre ne retrouve pas.
   */
  it("fait converger toutes les portes d'entrée vers la même chaîne", () => {
    const saisies = [
      "Awa@Boutique.CI",
      "awa@boutique.ci",
      "  AWA@BOUTIQUE.CI ",
      "aWa@bOuTiQuE.Ci",
    ];

    const resultats = new Set(
      SCHEMAS_ACCEPTING_EMAIL.flatMap(([, parseEmail]) =>
        saisies.map((saisie) => parseEmail(saisie)),
      ),
    );

    expect([...resultats]).toEqual(["awa@boutique.ci"]);
  });
});
