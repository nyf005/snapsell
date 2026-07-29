/**
 * Rôles autorisés à gérer la grille catégories→prix (paramètres).
 * Utilisé par le router settings, le layout dashboard et la page parametres.
 */
export const GRID_MANAGER_ROLES = ["OWNER", "MANAGER"] as const;

export function canManageGrid(role: string): boolean {
  return GRID_MANAGER_ROLES.includes(role as (typeof GRID_MANAGER_ROLES)[number]);
}

/**
 * Rôles qu'on peut attribuer à un membre — à l'invitation comme après coup.
 *
 * Source unique de `invitations.createInvitation`, de `team.updateRole` et du
 * sélecteur de la page Équipe. Ces trois-là divergeaient : l'invitation écrivait
 * `AGENT` en dur et `updateRole` n'acceptait que MANAGER et AGENT.
 *
 * VENDEUR n'y figure plus, et a été retiré de l'enum Prisma : aucun contrôle de
 * permission du code ne le distinguait d'AGENT — tous testent `canManageGrid`,
 * `isOpsUser`, ou si la cible est OWNER. Deux étiquettes pour un seul accès réel,
 * et une copie qui laissait croire à une cloison inexistante.
 *
 * Deux autres rôles de l'enum sont volontairement absents :
 *   OWNER — désigne la personne qui a créé la boutique. `team.updateRole` et
 *           `team.removeMember` refusent déjà d'y toucher.
 *   OPS   — console interne, hors boutique (tenantId null, cf. `isOpsUser`).
 *
 * L'ordre est celui du plus large au plus étroit : il pilote l'affichage.
 */
export const ASSIGNABLE_ROLES = ["MANAGER", "AGENT"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function isAssignableRole(role: string): role is AssignableRole {
  return ASSIGNABLE_ROLES.includes(role as AssignableRole);
}

/**
 * Un membre occupe-t-il un siège facturé ?
 *
 * `maxAgents` est la limite vendue sur la page Tarifs (free 0, starter 1, pro 5).
 * Le compteur ne regardait que `role: "AGENT"`, ce qui laissait deux trous :
 * promouvoir un Agent en Manager libérait un siège, et — dès que le rôle est
 * devenu choisissable à l'invitation — inviter en Manager n'en aurait jamais
 * consommé. Un siège vaut une personne, quel que soit son rôle.
 *
 * Exprimé comme **règle** et non comme liste, à dessein. Le comptage a reposé un
 * temps sur `ASSIGNABLE_ROLES`, au motif que les deux ensembles coïncidaient ;
 * la suppression de VENDEUR de l'attribuable aurait alors cessé de facturer les
 * membres concernés. « Tout le monde sauf le Propriétaire » ne peut pas dériver
 * quand un rôle est ajouté ou retiré. Côté Prisma : `role: { not: "OWNER" }`,
 * la requête filtrant déjà sur `tenantId`, qui exclut les OPS.
 */
export function occupiesSeat(role: string): boolean {
  return role !== "OWNER";
}

/**
 * Vérifie si un utilisateur a le rôle OPS (accès console ops multi-tenant, Story 7B.1).
 * Un user OPS a role="OPS" et tenantId=null. Mutuellement exclusif avec les rôles tenant.
 */
export function isOpsUser(role: string | null | undefined): boolean {
  return role === "OPS";
}
