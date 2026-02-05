/**
 * Rôles autorisés à gérer la grille catégories→prix (paramètres).
 * Utilisé par le router settings, le layout dashboard et la page parametres.
 */
export const GRID_MANAGER_ROLES = ["OWNER", "MANAGER"] as const;

export function canManageGrid(role: string): boolean {
  return GRID_MANAGER_ROLES.includes(role as (typeof GRID_MANAGER_ROLES)[number]);
}
