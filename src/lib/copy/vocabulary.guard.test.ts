import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { BANNED_AGREEMENTS, BANNED_TERMS, term } from "./vocabulary";
import { errorCopy, ui } from "./glossary";
import { HELP_TOPICS } from "./help";
import { NAV_ITEMS } from "~/lib/navigation";
import { botMsg } from "~/server/messaging/templates";

/**
 * Garde-fou du vocabulaire.
 *
 * Ce fichier ne lit que des **objets de chaînes** — jamais du source arbitraire.
 * Aucun faux positif n'est donc possible : toute alerte porte sur un texte qui part
 * réellement à l'écran ou sur WhatsApp.
 *
 * (Le balayage du code source, plus délicat, arrive avec les phases suivantes.)
 */

/** Aplatit un objet imbriqué en toutes ses chaînes, en évaluant les fonctions. */
function collectStrings(node: unknown, path = "", acc: [string, string][] = []) {
  if (typeof node === "string") {
    acc.push([path, node]);
  } else if (typeof node === "function") {
    // Les entrées paramétrées (`connectedDetail(phone)`) sont évaluées avec des
    // valeurs neutres, pour que leur texte fixe soit inspecté lui aussi.
    try {
      const arity = (node as (...a: unknown[]) => unknown).length;
      const args = Array.from({ length: arity }, (_, i) => (i === 0 ? "X" : 1));
      collectStrings((node as (...a: unknown[]) => unknown)(...args), path, acc);
    } catch {
      // Signature inattendue : on ignore plutôt que de faire échouer la garde.
    }
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      collectStrings(v, path ? `${path}.${k}` : k, acc);
    }
  }
  return acc;
}

const uiStrings = collectStrings(ui, "ui");
const errorStrings = collectStrings(errorCopy, "errorCopy");
const navStrings = NAV_ITEMS.flatMap((i) => [
  [`nav[${i.href}].label`, i.label] as [string, string],
  ...(i.description
    ? [[`nav[${i.href}].description`, i.description] as [string, string]]
    : []),
]);
const clientStrings = collectStrings(botMsg.client, "botMsg.client");
const sellerStrings = collectStrings(botMsg.seller, "botMsg.seller");

/**
 * L'aide est du texte affiché comme un autre, et c'est le plus long du produit :
 * c'est là que le vocabulaire dériverait en premier si personne ne regardait.
 *
 * Une exception assumée, portée par les blocs `chat` : ils citent le robot, qui
 * tutoie. Le test de registre plus bas ne s'applique donc qu'à `botMsg.client` ;
 * `help.test.ts` vérifie de son côté que ces citations ne vouvoient pas.
 */
const helpStrings = collectStrings(HELP_TOPICS, "help");

/** Tout ce qui est affiché ou envoyé, hors marketing (phase 5). */
const allStrings = [
  ...uiStrings,
  ...errorStrings,
  ...navStrings,
  ...clientStrings,
  ...sellerStrings,
  ...helpStrings,
];

describe("Vocabulaire — termes écartés", () => {
  it.each(BANNED_TERMS.map((b) => [b.pattern.source, b] as const))(
    "aucun texte ne contient /%s/",
    (_src, banned) => {
      const offenders = allStrings
        .filter(([, value]) => banned.pattern.test(value))
        .map(([path, value]) => `${path} → « ${value} »`);
      expect(
        offenders,
        `Utilisez « ${banned.use} » — ${banned.why}\n${offenders.join("\n")}`,
      ).toEqual([]);
    },
  );
});

describe("Vocabulaire — accords qui genrent la personne", () => {
  it.each(BANNED_AGREEMENTS.map((b) => [b.phrase, b] as const))(
    "aucun texte ne contient « %s »",
    (_phrase, banned) => {
      const offenders = allStrings
        .filter(([, value]) => value.includes(banned.phrase))
        .map(([path]) => path);
      expect(offenders, `Écrivez plutôt « ${banned.use} »`).toEqual([]);
    },
  );
});

describe("Registre — le bot tutoie, le web vouvoie", () => {
  it("botMsg.client ne vouvoie jamais", () => {
    const offenders = clientStrings
      .filter(([, v]) => /\b(vous|votre|vos|Vouliez|Répondez|Revenez|laissez)\b/i.test(v))
      .map(([path, v]) => `${path} → « ${v.slice(0, 70)} »`);
    expect(
      offenders,
      `Le bot tutoie la personne qui achète.\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("botMsg.seller ne mélange pas les registres", () => {
    const offenders = sellerStrings
      .filter(([, v]) => /\bRépondez\b/.test(v))
      .map(([path, v]) => `${path} → « ${v.slice(0, 70)} »`);
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

describe("Typographie", () => {
  it("aucune apostrophe droite dans les textes envoyés ou affichés", () => {
    const offenders = allStrings
      .filter(([, v]) => v.includes("'"))
      .map(([path, v]) => `${path} → « ${v.slice(0, 70)} »`);
    expect(
      offenders,
      `Utilisez l’apostrophe typographique ’\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});

describe("Casse des en-têtes interactifs", () => {
  it("les en-têtes WhatsApp sont en casse de phrase", () => {
    // « ✅ Article Ajouté » était en Title Case anglaise, à côté de
    // « ⚡ Action requise » en casse de phrase : deux conventions coexistaient.
    const headers = [...clientStrings, ...sellerStrings].filter(([path]) =>
      path.endsWith(".header"),
    );
    const offenders = headers
      .filter(([, v]) => {
        // On retire emoji et ponctuation de tête, puis on cherche deux mots
        // capitalisés qui se suivent.
        const text = v.replace(/^[^\p{L}]+/u, "");
        return /\p{Lu}\p{Ll}+ +\p{Lu}\p{Ll}/u.test(text);
      })
      .map(([path, v]) => `${path} → « ${v} »`);
    expect(offenders, `Casse de phrase attendue.\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("Promesses invérifiables", () => {
  const claims: [RegExp, string][] = [
    [/\d+\s*\+?\s*(vendeur|boutique|entreprise)/i, "chiffre d’adoption invérifiable"],
    [/\bessai gratuit\b/i, "il n’existe aucun essai : le plan Gratuit est permanent"],
    [/Systèmes opérationnels/i, "aucune page de statut ne soutient cette affirmation"],
  ];
  it.each(claims)("aucun texte ne contient /%s/", (pattern, why) => {
    const offenders = allStrings
      .filter(([, v]) => pattern.test(v))
      .map(([path, v]) => `${path} → « ${v.slice(0, 70)} »`);
    expect(offenders, `${why}\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("Vocabulaire — cohérence de la table", () => {
  it("chaque terme canonique est non vide", () => {
    for (const [k, v] of Object.entries(term)) {
      expect(v, k).toBeTruthy();
    }
  });

  it("aucun terme canonique n’est lui-même banni", () => {
    // Empêche une contradiction interne : ajouter « live » aux bannis casserait
    // le vocabulaire au lieu de le protéger.
    for (const [k, value] of Object.entries(term)) {
      for (const banned of BANNED_TERMS) {
        expect(banned.pattern.test(value), `term.${k} = « ${value} »`).toBe(false);
      }
    }
  });
});



/**
 * ─────────────────────────────────────────────────────────────────────────────
 * BALAYAGE DU CODE SOURCE — `describe.skip`, à activer en phase 4.
 *
 * Le mécanisme est écrit et vérifié. Il retire les commentaires avant analyse,
 * pour que `vocabulary.ts` et l'en-tête de `glossary.ts` puissent **citer** les
 * termes écartés en expliquant la règle sans se dénoncer eux-mêmes.
 *
 * Actif depuis la phase 4. Toute réapparition d'un terme écarté fait échouer la
 * suite, y compris dans un fichier qui n'a jamais été touché par ce chantier.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const ROOTS = ["src/app", "src/server", "src/components", "src/lib"];

const ALLOWED = [
  // Console interne SnapSell : pas d'exigence de vocabulaire vendeur.
  "src/app/(ops)/",
  // La table des termes écartés doit pouvoir les nommer dans ses motifs, sinon
  // la garde se dénonce elle-même.
  "src/lib/copy/vocabulary.ts",
  // Worker dont le nom même est « reservation-ttl » : le sigle n'apparaît que
  // dans des journaux destinés aux développeurs, jamais à l'écran.
  "src/server/workers/reservation-ttl.ts",
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

/**
 * Retire les commentaires : seul le code exécuté est inspecté.
 *
 * Y compris les commentaires de fin de ligne — c'est là que vivent les mentions
 * techniques légitimes (« lier la réservation à la session live »). Le `(?<!:)`
 * évite de couper une URL sur son `://`.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(?<!:)\/\/[^\n]*/g, "");
}

describe("Vocabulaire — balayage du code source", () => {
  const sourceFiles = ROOTS.flatMap((r) => walk(r)).filter(
    (f) => !ALLOWED.some((a) => f.includes(a)),
  );

  it.each(BANNED_TERMS.map((b) => [b.pattern.source, b] as const))(
    "aucun fichier ne contient /%s/",
    (_src, banned) => {
      const offenders = sourceFiles.filter((f) =>
        banned.pattern.test(stripComments(readFileSync(f, "utf8"))),
      );
      expect(
        offenders,
        `Utilisez « ${banned.use} » — ${banned.why}\n${offenders.join("\n")}`,
      ).toEqual([]);
    },
  );

  it.each(BANNED_AGREEMENTS.map((b) => [b.phrase, b] as const))(
    "aucun fichier ne contient « %s »",
    (_phrase, banned) => {
      const offenders = sourceFiles.filter((f) =>
        stripComments(readFileSync(f, "utf8")).includes(banned.phrase),
      );
      expect(offenders, `Écrivez plutôt « ${banned.use} »`).toEqual([]);
    },
  );

  /**
   * La page de connexion affichait « Rejoignez plus de 10 000 entreprises ».
   * Le contrôle des promesses invérifiables existait déjà, mais ne lisait que
   * `ui` / `errorCopy` / `botMsg` — jamais le JSX. Il balaie maintenant le
   * source, là où vivent les textes marketing.
   */
  it.each([
    // Deux motifs plutôt qu’un, pour ne pas frapper « 1 vendeur + 1 agent »,
    // qui compte des sièges et non des boutiques inscrites : la tournure…
    [
      /(?:plus de|rejoignez|déjà)\s+[\d\s\u00a0\u202f]+(?:vendeurs?|boutiques?|entreprises?|utilisateurs?)\b/i,
      "chiffre d’adoption invérifiable",
    ],
    // …et l’ordre de grandeur : quatre chiffres ou plus devant le nom.
    [
      /\d[\d\s\u00a0\u202f]{3,}(?:vendeurs?|boutiques?|entreprises?)\b/i,
      "chiffre d’adoption invérifiable",
    ],
    [/Systèmes opérationnels/i, "aucune page de statut ne soutient cette affirmation"],
  ] as [RegExp, string][])("aucun fichier ne contient /%s/", (pattern, why) => {
    const offenders = sourceFiles.filter((f) =>
      pattern.test(stripComments(readFileSync(f, "utf8"))),
    );
    expect(offenders, `${why}\n${offenders.join("\n")}`).toEqual([]);
  });
});
