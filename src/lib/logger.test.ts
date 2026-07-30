import { describe, expect, it } from "vitest";

import { redactContext } from "./logger";

/**
 * Le logger ne laisse pas sortir un numéro de cliente en clair.
 *
 * Vingt-quatre appels en passaient un — webhook, outbox, adaptateur Meta, preuves —
 * alors que l'export CSV les masquait déjà et que l'architecture interdit la PII
 * dans l'`event_log`. Seuls les journaux applicatifs y échappaient, et ils partent
 * vers un agrégateur tiers dont la rétention n'est pas celle de la base.
 *
 * Le masquage est central : ces tests protègent l'endroit unique plutôt que les
 * vingt-quatre sites.
 */
describe("redactContext — masquage des numéros", () => {
  it("masque les clés connues", () => {
    expect(redactContext({ from: "+2250701020304" })).toEqual({ from: "***0304" });
    expect(redactContext({ to: "+2250701020304" })).toEqual({ to: "***0304" });
    expect(redactContext({ clientPhone: "+33612345678" })).toEqual({
      clientPhone: "***5678",
    });
    expect(redactContext({ clientPhoneE164: "+33612345678" })).toEqual({
      clientPhoneE164: "***5678",
    });
  });

  /** Le second filet : une clé inconnue ne doit pas laisser passer un E.164. */
  it("masque tout E.164 quelle que soit la clé", () => {
    expect(redactContext({ destinataireInattendu: "+2250701020304" })).toEqual({
      destinataireInattendu: "***0304",
    });
  });

  /**
   * Le `+` est exigé à dessein : sans lui, un horodatage en millisecondes
   * ressemblerait à un numéro et on perdrait un repère de diagnostic pour rien.
   */
  it("ne touche pas aux nombres qui ne sont pas des numéros", () => {
    expect(redactContext({ ts: "1757000000000" })).toEqual({ ts: "1757000000000" });
    expect(redactContext({ correlationId: "order-abc-123456789" })).toEqual({
      correlationId: "order-abc-123456789",
    });
    expect(redactContext({ orderNumber: "SS-0042" })).toEqual({ orderNumber: "SS-0042" });
    expect(redactContext({ attempts: 3, allowed: true })).toEqual({
      attempts: 3,
      allowed: true,
    });
  });

  it("descend dans les objets et les tableaux", () => {
    expect(
      redactContext({
        job: { payload: { to: "+2250701020304" } },
        recipients: ["+2250701020304", "+33612345678"],
      }),
    ).toEqual({
      job: { payload: { to: "***0304" } },
      recipients: ["***0304", "***5678"],
    });
  });

  it("laisse passer null, undefined et les valeurs vides", () => {
    expect(redactContext(undefined)).toBeUndefined();
    expect(redactContext({ from: "" })).toEqual({ from: "" });
    expect(redactContext({ tenantId: null })).toEqual({ tenantId: null });
  });

  /** Une Error copiée clé par clé perdrait son message : elle passe intacte. */
  it("préserve les Error", () => {
    const err = new Error("échec réseau");
    const out = redactContext({ err }) as { err: Error };
    expect(out.err).toBeInstanceOf(Error);
    expect(out.err.message).toBe("échec réseau");
  });

  it("s'arrête avant une imbrication sans fin", () => {
    const cyclique: Record<string, unknown> = { name: "boucle" };
    cyclique.self = cyclique;
    // Ne doit pas déborder la pile, et rester sérialisable.
    expect(() => JSON.stringify(redactContext(cyclique))).not.toThrow();
  });
});
