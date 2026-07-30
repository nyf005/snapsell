import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Garde-fou : tout contrôle de formulaire garde un nom accessible.
 *
 * Ces défauts sont invisibles à la relecture — la page a l'air correcte, le
 * libellé est là, à sa place. Ils ne se voient qu'au lecteur d'écran, ou quand un
 * test cherche un élément par son nom accessible et ne le trouve pas. C'est
 * exactement comme ça que le premier a été découvert.
 *
 * Trois pièges relevés dans le code, chacun gardé ici :
 *
 * 1. `aria-label` sur une **racine Radix**. `Select`, `Popover`, `Tooltip`,
 *    `Dialog` et compagnie ne rendent aucun élément DOM : l'attribut est
 *    silencieusement perdu. Le sélecteur de statut d'une commande n'avait ainsi
 *    aucun nom — un lecteur d'écran annonçait « liste déroulante », sans dire de
 *    quelle commande. Le nom va sur le déclencheur.
 *
 * 2. `SelectTrigger` sans `id` ni `aria-label`. Trois sélecteurs de réglages
 *    étaient dans ce cas, avec un `<label>` voisin qui *paraissait* les étiqueter.
 *
 * 3. `<label>` sans `htmlFor`. Un label qui n'est associé à rien n'étiquette rien.
 *    Et il ne peut pas étiqueter un bouton : « Ouverture » et « Fermeture » du
 *    sélecteur d'horaires produisaient deux boutons annonçant tous deux
 *    « 09:00 », indistinguables. Pour un bouton, le nom passe par `aria-label`.
 */

const ROOTS = ["src/app", "src/components"];

/** Racines Radix qui ne rendent aucun élément DOM : y poser `aria-label` est vain. */
const NON_RENDERING_ROOTS = [
  "Select",
  "Popover",
  "Tooltip",
  "Dialog",
  "AlertDialog",
  "DropdownMenu",
  "Sheet",
  "Collapsible",
  "Accordion",
  "Tabs",
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) acc.push(full);
  }
  return acc;
}

const sourceFiles = ROOTS.flatMap((r) => walk(r));

/**
 * Contenu d'un fichier, commentaires retirés et sauts de ligne écrasés.
 *
 * Les deux traitements sont nécessaires : le JSX s'étale sur plusieurs lignes, et
 * les commentaires de ce dépôt *citent* le code qu'ils expliquent — un
 * commentaire disant qu'un `<label>` doit porter `htmlFor` se signalait lui-même.
 */
function flat(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ") // blocs, y compris {/* … */} du JSX
    .replace(/(^|\s)\/\/[^\n]*/g, "$1") // lignes, hors « https:// »
    .replace(/\s+/g, " ");
}

/** Les ouvertures de balise `<Name ...>`, avec leur liste d'attributs. */
function openingTags(source: string, name: string): string[] {
  const re = new RegExp(`<${name}(\\s[^>]*?)?/?>`, "g");
  return [...source.matchAll(re)].map((m) => m[0]);
}

describe("Noms accessibles — pièges relevés dans le code", () => {
  it("aucun `aria-label` sur une racine Radix, qui ne rend pas de DOM", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = flat(file);
      for (const root of NON_RENDERING_ROOTS) {
        // `<Select ...>` et non `<SelectTrigger ...>` : la limite de mot l'assure.
        for (const tag of openingTags(source, `${root}(?![A-Za-z])`)) {
          if (tag.includes("aria-label")) {
            offenders.push(`${file} → ${tag.slice(0, 90)}`);
          }
        }
      }
    }
    expect(
      offenders,
      `Posez le nom sur le déclencheur (\`${"SelectTrigger"}\`, \`PopoverTrigger\`…), ` +
        `la racine Radix ne rend aucun élément :\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("chaque `SelectTrigger` porte un `id` ou un `aria-label`", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      // Le composant partagé définit le primitif : il n'a pas à se nommer lui-même.
      if (file.endsWith(join("components", "ui", "select.tsx"))) continue;
      for (const tag of openingTags(flat(file), "SelectTrigger")) {
        if (!/\bid=/.test(tag) && !/aria-label/.test(tag)) {
          offenders.push(`${file} → ${tag.slice(0, 90)}`);
        }
      }
    }
    expect(
      offenders,
      `Un sélecteur sans nom accessible s'annonce « liste déroulante ». Ajoutez un ` +
        `\`id\` relié à un \`<label htmlFor>\`, ou un \`aria-label\` :\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("aucun `<label>` sans `htmlFor`", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      for (const tag of openingTags(flat(file), "label")) {
        if (!/htmlFor=/.test(tag)) offenders.push(`${file} → ${tag.slice(0, 90)}`);
      }
    }
    expect(
      offenders,
      `Un \`<label>\` non associé n'étiquette rien, et ne peut pas étiqueter un ` +
        `bouton. Reliez-le par \`htmlFor\`, ou utilisez \`<span>\` + \`aria-label\` ` +
        `sur la cible :\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
