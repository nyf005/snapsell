import { z } from "zod";

/**
 * ── L'ADRESSE EST NORMALISÉE AVANT TOUTE RECHERCHE ──────────────────────────
 *
 * `authorize()` cherchait le compte avec l'adresse telle que saisie, et
 * l'inscription l'enregistrait telle que saisie. Une personne inscrite avec
 * « Awa@boutique.ci » ne pouvait donc pas se connecter en tapant
 * « awa@boutique.ci » — et pouvait, pire, créer un second compte avec la même
 * adresse à la casse près, la contrainte d'unicité ne voyant que deux chaînes
 * différentes.
 *
 * La normalisation est posée dans les schémas parce que c'est le seul point de
 * passage commun : `loginInputSchema` sert au formulaire **et** à `authorize()`,
 * `signupInputSchema` au formulaire **et** au routeur tRPC. La corriger sur les
 * appelants aurait recréé la divergence qu'on répare.
 *
 * `createInvitationInputSchema` le faisait déjà — c'est ce décalage qui rendait
 * l'incohérence difficile à voir.
 * ────────────────────────────────────────────────────────────────────────────
 */
/**
 * L'ordre compte : `.trim().toLowerCase()` **avant** `.email()`.
 *
 * Posés après, ils ne s'appliquaient qu'à une valeur déjà validée — et une
 * adresse collée depuis un clavier mobile, avec son espace de fin, était donc
 * refusée d'un « Email invalide » incompréhensible plutôt que détourée.
 * `createInvitationInputSchema` avait ce même défaut.
 */
export const loginInputSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalide"),
  password: z.string().min(1, "Le mot de passe est requis"),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

/**
 * Valide les champs login côté client (même schéma que le serveur).
 * Retourne les erreurs par champ ou null si valide.
 */
export function getLoginValidationErrors(data: {
  email: string;
  password: string;
}): Record<string, string> | null {
  const result = loginInputSchema.safeParse(data);
  if (result.success) return null;
  const err: Record<string, string> = {};
  const fieldErrors = result.error.flatten().fieldErrors;
  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (messages?.[0]) err[key] = messages[0];
  }
  return err;
}
