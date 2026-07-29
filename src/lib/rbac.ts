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
 * `AGENT` en dur, `updateRole` n'acceptait que MANAGER et AGENT, et VENDEUR
 * n'était donc attribuable par aucun chemin malgré son existence dans l'enum
 * Prisma, dans `roleLabel` et dans `roleDescription`.
 *
 * Deux rôles de l'enum sont volontairement absents :
 *   OWNER — désigne la personne qui a créé la boutique. `team.updateRole` et
 *           `team.removeMember` refusent déjà d'y toucher.
 *   OPS   — console interne, hors boutique (tenantId null, cf. `isOpsUser`).
 *
 * L'ordre est celui du plus large au plus étroit : il pilote l'affichage.
 */
export const ASSIGNABLE_ROLES = ["MANAGER", "VENDEUR", "AGENT"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/**
 * Un membre occupe-t-il un siège facturé ?
 *
 * Les sièges sont exactement les rôles assignables : dans une boutique, on est
 * soit le Propriétaire — qui ne consomme pas de siège — soit l'un d'eux. Une même
 * liste sert donc au sélecteur, aux deux routers et au compteur de quota, côté
 * TypeScript comme côté Prisma (`role: { in: [...ASSIGNABLE_ROLES] }`).
 *
 * `maxAgents` est la limite vendue sur la page Tarifs (free 0, starter 1, pro 5).
 * Le compteur ne regardait que `role: "AGENT"`, ce qui laissait deux trous :
 * promouvoir un Agent en Manager libérait un siège, et — dès que le rôle devient
 * choisissable à l'invitation — inviter en Manager ou en Vente n'en aurait jamais
 * consommé.
 */
export function occupiesSeat(role: string): role is AssignableRole {
  return ASSIGNABLE_ROLES.includes(role as AssignableRole);
}

/**
 * Vérifie si un utilisateur a le rôle OPS (accès console ops multi-tenant, Story 7B.1).
 * Un user OPS a role="OPS" et tenantId=null. Mutuellement exclusif avec les rôles tenant.
 */
export function isOpsUser(role: string | null | undefined): boolean {
  return role === "OPS";
}
