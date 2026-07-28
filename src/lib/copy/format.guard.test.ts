import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  formatXof,
  formatXofUnits,
  formatXofUnitsParts,
  formatDateCompact,
  formatDateTime,
} from "./format";

/**
 * Garde-fou : le formatage de la monnaie et des dates doit rester centralisé.
 *
 * L'application affichait « 5 000 F CFA » sur les écrans Live et Catalogue et
 * « 5 000 FCFA » ailleurs, parce que chaque composant construisait son propre
 * `Intl.NumberFormat`. Trois implémentations de `formatRelativeTime` coexistaient
 * aussi, dont une qui pouvait afficher « Il y a 400j ».
 *
 * Ce test échoue si un composant recommence.
 */

const ROOTS = ["src/app", "src/server", "src/components"];

/** Fichiers exemptés, avec la raison. */
const ALLOWED = [
  // Console interne SnapSell : pas d'exigence de vocabulaire vendeur.
  "src/app/(ops)/",
  // Calcule l'heure locale dans un fuseau pour le message d'absence : ce n'est
  // pas du formatage d'affichage, et aucun helper partagé ne le remplace.
  "src/server/workers/webhook-processor.ts",
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

const sourceFiles = ROOTS.flatMap((r) => walk(r)).filter(
  (f) => !ALLOWED.some((a) => f.includes(a)),
);

describe("Formatage centralisé", () => {
  it("aucun composant ne construit son propre Intl.NumberFormat", () => {
    const offenders = sourceFiles.filter((f) =>
      readFileSync(f, "utf8").includes("Intl.NumberFormat"),
    );
    expect(
      offenders,
      `Utilisez formatXof / formatXofUnits de ~/lib/copy :\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("aucun composant ne construit son propre Intl.DateTimeFormat", () => {
    const offenders = sourceFiles.filter((f) =>
      readFileSync(f, "utf8").includes("Intl.DateTimeFormat"),
    );
    expect(
      offenders,
      `Utilisez formatDateTime / formatDateCompact / formatRelativeDate de ~/lib/copy :\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("aucun composant ne redéfinit un formateur de prix ou de temps", () => {
    const banned = /function\s+(formatPrice|formatRevenueCents|formatRelativeTime|formatProofDate|formatOrderDate|formatEventDate)\b/;
    const offenders = sourceFiles.filter((f) => banned.test(readFileSync(f, "utf8")));
    expect(offenders, `Formateurs locaux à supprimer :\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("La monnaie s’écrit FCFA partout", () => {
  it("formatXof convertit les centimes", () => {
    expect(formatXof(500_000)).toBe("5 000 FCFA".replace(" ", " "));
  });

  it("formatXofUnits prend des unités", () => {
    expect(formatXofUnits(25_000)).toBe("25 000 FCFA".replace(" ", " "));
  });

  it("n’emploie jamais le symbole « F CFA » d’Intl", () => {
    // C'est ce que produisait `style: "currency", currency: "XOF"`.
    expect(formatXof(500_000)).not.toContain("F CFA");
    expect(formatXofUnits(25_000)).not.toContain("F CFA");
  });

  it("formatXofUnitsParts sépare le montant de la monnaie", () => {
    // Les cartes de tarifs affichent le nombre en 48px et « FCFA » en 16px ;
    // le découpage doit rester ici pour que la monnaie s'écrive à un seul endroit.
    const parts = formatXofUnitsParts(25_000);
    expect(parts.currency).toBe("FCFA");
    // Recollées, les deux moitiés redonnent exactement la forme d'un seul tenant.
    expect(`${parts.amount} ${parts.currency}`).toBe(formatXofUnits(25_000));
  });

  it("gère l’absence de montant", () => {
    expect(formatXof(null)).toBe("—");
    expect(formatXofUnits(undefined)).toBe("—");
    expect(formatXofUnitsParts(null)).toEqual({ amount: "—", currency: null });
  });
});

describe("Formateurs de date", () => {
  const d = new Date("2026-02-09T14:30:00Z");

  it("formatDateCompact donne jour, mois court et année", () => {
    expect(formatDateCompact(d)).toMatch(/2026/);
    expect(formatDateCompact(d)).toMatch(/f[ée]vr/i);
  });

  it("formatDateTime ajoute l’heure", () => {
    expect(formatDateTime(d)).toMatch(/\d{2}:\d{2}/);
  });

  it("gèrent une date absente ou invalide", () => {
    expect(formatDateCompact(null)).toBe("—");
    expect(formatDateTime("pas une date")).toBe("—");
  });
});
