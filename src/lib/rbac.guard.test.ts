import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ASSIGNABLE_ROLES, canManageGrid, isOpsUser, occupiesSeat } from "./rbac";

/**
 * Garde-fou : la liste des rôles de gestion ne se recopie pas à la main.
 *
 * `canManageGrid` existe depuis longtemps, et pourtant la comparaison
 * `role === "OWNER" || role === "MANAGER"` a été réécrite à la main dans trois
 * endroits différents — la page des commandes, celle du journal d'activité, et
 * l'export CSV du journal. Chaque copie est un endroit qui ne suivra pas une
 * évolution de `GRID_MANAGER_ROLES`, et le défaut est silencieux : la copie
 * continue de compiler et de s'exécuter, simplement elle décide autrement.
 *
 * C'est exactement ce qui est arrivé aux libellés de rôle sur la page Équipe :
 * un style conditionné à « Admin », que `roleLabel` ne renvoie plus, avait
 * silencieusement cessé de s'appliquer.
 */

const ROOTS = ["src/app", "src/server", "src/lib"];

/**
 * Exemptions, avec leur raison.
 *
 * `team.ts` vérifie si la **cible** d'une action est le Propriétaire — pas si
 * l'appelant peut gérer. Ce n'est pas la même question, et `canManageGrid` ne
 * l'exprimerait pas.
 */
const ALLOWED = [
  join("src", "lib", "rbac.ts"),
  join("src", "server", "api", "routers", "team.ts"),
  // Le calcul des sièges : `occupiesSeat` porte la règle, la requête Prisma
  // l'exprime en SQL. Voir le commentaire de `countOccupiedSeats`.
  join("src", "server", "subscription", "usage.ts"),
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
  (f) => !ALLOWED.some((a) => f.endsWith(a)),
);

/** Sans les commentaires : ceux de ce dépôt citent le code qu'ils expliquent. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");
}

describe("RBAC — la liste des rôles reste centralisée", () => {
  it("aucun fichier ne recompose le test OWNER/MANAGER à la main", () => {
    /**
     * Les deux formes rencontrées : la positive et la négative.
     *
     * Le littéral `["OWNER", "MANAGER"]` n'est volontairement pas traqué : `help.ts`
     * l'emploie pour dire à quels rôles un article s'adresse, ce qui n'est pas un
     * contrôle de permission. Un motif qui crie sur du code correct finit ignoré.
     */
    const patterns = [
      /===\s*"OWNER"\s*\|\|[^\n]*===\s*"MANAGER"/,
      /!==\s*"OWNER"\s*&&[^\n]*!==\s*"MANAGER"/,
    ];
    const offenders = sourceFiles.filter((f) => {
      const source = code(f);
      return patterns.some((p) => p.test(source));
    });
    expect(
      offenders,
      `Utilisez \`canManageGrid\` de ~/lib/rbac :\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});

describe("RBAC — les prédicats", () => {
  it("canManageGrid ne reconnaît que le Propriétaire et le Manager", () => {
    expect(canManageGrid("OWNER")).toBe(true);
    expect(canManageGrid("MANAGER")).toBe(true);
    expect(canManageGrid("AGENT")).toBe(false);
    expect(canManageGrid("OPS")).toBe(false);
    expect(canManageGrid("")).toBe(false);
  });

  /** Un siège = une personne invitée. Le Propriétaire n'en consomme pas. */
  it("occupiesSeat exclut le Propriétaire et compte les rôles assignables", () => {
    expect(occupiesSeat("OWNER")).toBe(false);
    for (const role of ASSIGNABLE_ROLES) {
      expect(occupiesSeat(role), role).toBe(true);
    }
  });

  /**
   * OWNER ne s'attribue pas par invitation — sans quoi une invitation pourrait
   * fabriquer un second Propriétaire — et OPS vit hors boutique.
   */
  it("ASSIGNABLE_ROLES exclut OWNER et OPS", () => {
    expect(ASSIGNABLE_ROLES).not.toContain("OWNER");
    expect(ASSIGNABLE_ROLES).not.toContain("OPS");
    expect(ASSIGNABLE_ROLES.length).toBeGreaterThan(0);
  });

  it("isOpsUser ne reconnaît que OPS", () => {
    expect(isOpsUser("OPS")).toBe(true);
    expect(isOpsUser("OWNER")).toBe(false);
    expect(isOpsUser(null)).toBe(false);
    expect(isOpsUser(undefined)).toBe(false);
  });
});
