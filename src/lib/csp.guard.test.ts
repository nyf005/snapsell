import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config.js";

/**
 * ── LA CSP NE DOIT PAS ÉTRANGLER L'INSCRIPTION WHATSAPP ─────────────────────
 *
 * Ce garde-fou existe parce que le même défaut a frappé deux fois.
 *
 * La CSP a été introduite en réponse à un audit — il n'y en avait aucune. Elle
 * a chaque fois été écrite en pensant à ce qu'on connaissait de Meta, et chaque
 * fois il manquait quelque chose, avec le même symptôme : rien ne se passe, pas
 * d'erreur, pas de trace. Deux allers-retours de diagnostic pour la même cause.
 *
 *   1er passage — `frame-src` et `connect-src` ne listaient que
 *      `graph.facebook.com` et `connect.facebook.net`. Le SDK installe une
 *      iframe cachée sur `staticxx.facebook.com` (son canal de retour) et
 *      interroge `www.facebook.com` : le rappel de `FB.login()` n'arrivait
 *      jamais et le bouton restait figé.
 *
 *   2e passage — `form-action` valait `'self'`, au motif que les redirections
 *      de paiement sont des navigations. Vrai pour Paystack. Mais le SDK Meta
 *      **poste un formulaire** vers `facebook.com/.../dialog/oauth` : la
 *      soumission était refusée en silence, et l'inscription — qui fonctionnait
 *      en pleine page — a cessé de s'ouvrir.
 *
 * La leçon n'est pas « ajouter des domaines » mais : resserrer une directive
 * sans savoir ce que le SDK tiers fait réellement casse une fonctionnalité
 * entière, sans bruit. Ce test transforme cette connaissance en échec visible.
 *
 * Si un jour l'inscription WhatsApp intégrée disparaît du produit, ce test
 * disparaît avec elle — mais pas avant.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** Directives qui doivent laisser passer Meta, et ce que chacune sert. */
const DIRECTIVES_REQUISES: ReadonlyArray<{
  nom: string;
  role: string;
  /** Une de ces valeurs au moins doit être présente. */
  attendu: readonly string[];
}> = [
  {
    nom: "script-src",
    role: "chargement du SDK",
    attendu: ["https://connect.facebook.net"],
  },
  {
    nom: "connect-src",
    role: "état de session interrogé en XHR",
    attendu: ["https://*.facebook.com"],
  },
  {
    nom: "frame-src",
    role: "iframe XD Arbiter, canal de retour du SDK",
    attendu: ["https://*.facebook.com"],
  },
  {
    nom: "form-action",
    role: "ouverture du parcours par soumission de formulaire",
    attendu: ["https://*.facebook.com"],
  },
];

async function getCspDirectives(): Promise<Map<string, string>> {
  const groupes = (await (
    nextConfig as { headers: () => Promise<
      { source: string; headers: { key: string; value: string }[] }[]
    > }
  ).headers());

  const csp = groupes
    .flatMap((g) => g.headers)
    .find((h) => h.key.toLowerCase() === "content-security-policy")?.value;

  expect(csp, "aucun en-tête Content-Security-Policy n'est défini").toBeTruthy();

  const map = new Map<string, string>();
  for (const directive of csp!.split(";")) {
    const trimmed = directive.trim();
    if (!trimmed) continue;
    const nom = trimmed.split(/\s+/)[0]!;
    map.set(nom, trimmed);
  }
  return map;
}

describe("CSP — inscription WhatsApp intégrée", () => {
  for (const { nom, role, attendu } of DIRECTIVES_REQUISES) {
    it(`${nom} autorise Meta (${role})`, async () => {
      const directives = await getCspDirectives();
      const valeur = directives.get(nom);

      expect(valeur, `la directive ${nom} est absente de la CSP`).toBeTruthy();
      expect(
        attendu.some((source) => valeur!.includes(source)),
        `${nom} doit autoriser ${attendu.join(" ou ")} — sans quoi le parcours Meta échoue en silence (${role})`,
      ).toBe(true);
    });
  }

  /**
   * Le joker ne doit pas devenir un blanc-seing : il est là pour les
   * sous-domaines de Meta, pas pour ouvrir la CSP au reste du web.
   */
  it("n'autorise pas n'importe quelle origine", async () => {
    const directives = await getCspDirectives();
    for (const [nom, valeur] of directives) {
      if (nom === "img-src") continue; // `https:` y est assumé (médias R2).
      expect(valeur, `${nom} ne doit pas autoriser toutes les origines`).not.toMatch(
        /(^|\s)\*($|\s)/,
      );
    }
  });

  /** Les protections qui ne doivent pas disparaître au fil des ajustements. */
  it("conserve les verrous qui ne concernent pas Meta", async () => {
    const directives = await getCspDirectives();
    expect(directives.get("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directives.get("object-src")).toBe("object-src 'none'");
    expect(directives.get("base-uri")).toBe("base-uri 'self'");
  });
});
