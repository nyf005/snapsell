/**
 * Sentry est un service tiers : tout ce qui y part quitte notre infrastructure.
 *
 * Le logger masque déjà les numéros, mais son motif est **ancré** — il ne
 * reconnaît qu'une valeur entière. Les messages d'erreur, eux, portent le numéro
 * au milieu d'une phrase (« Failed to send to +2250701020304 »), là où seul un
 * motif non ancré le retrouve. C'est ce que ce fichier protège.
 */

import { describe, expect, it } from "vitest";

import { scrubPhones } from "./sentry";

describe("scrubPhones", () => {
  it("masque un numéro au milieu d'un message d'erreur", () => {
    expect(scrubPhones("Failed to send to +2250701020304")).toBe(
      "Failed to send to ***0304",
    );
  });

  it("masque tous les numéros d'un même message", () => {
    expect(scrubPhones("de +2250701020304 vers +33612345678")).toBe(
      "de ***0304 vers ***5678",
    );
  });

  /** Le contexte de l'erreur doit rester lisible : on masque, on ne supprime pas. */
  it("laisse le reste du texte intact", () => {
    const result = scrubPhones("timeout après 3 essais pour +2250701020304 (job 42)");
    expect(result).toContain("timeout après 3 essais");
    expect(result).toContain("(job 42)");
    expect(result).not.toContain("+2250701020304");
  });

  it("ne touche pas un texte sans numéro", () => {
    expect(scrubPhones("Unable to start a transaction")).toBe(
      "Unable to start a transaction",
    );
  });

  /** Un identifiant purement numérique n'est pas un numéro E.164. */
  it("ne masque pas un nombre sans indicatif", () => {
    expect(scrubPhones("commande 0701020304 en attente")).toBe(
      "commande 0701020304 en attente",
    );
  });

  it("masque un numéro collé à une ponctuation", () => {
    expect(scrubPhones("destinataire=+2250701020304,")).toBe("destinataire=***0304,");
  });
});
