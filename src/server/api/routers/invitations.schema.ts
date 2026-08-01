import { z } from "zod";

import { ASSIGNABLE_ROLES } from "~/lib/rbac";

export const createInvitationInputSchema = z.object({
  /**
   * `.trim().toLowerCase()` passe **avant** `.email()`, et non après.
   *
   * Posés après, ils ne s'appliquaient qu'à une valeur déjà validée : une
   * adresse collée avec son espace de fin — le cas courant sur mobile — était
   * refusée d'un « Adresse email invalide » au lieu d'être détourée. Le
   * garde-fou `email-normalization.guard.test.ts` fige cet ordre.
   */
  email: z.string().trim().toLowerCase().email("Adresse email invalide"),
  /**
   * Le rôle attribué à l'invitation. `AGENT` par défaut : c'est ce que le router
   * écrivait en dur avant que le rôle devienne choisissable, et c'est le rôle le
   * plus étroit — un appel qui l'omet ne peut donc pas élargir un accès par accident.
   */
  role: z.enum(ASSIGNABLE_ROLES).default("AGENT"),
});

export const getInvitationByTokenInputSchema = z.object({
  token: z.string().min(1, "Token requis"),
});

/**
 * `name` et `password` sont optionnels, et c'est le résolveur qui les exige.
 *
 * Ils ne servent qu'à **créer** un compte. Quand l'invitation vise une adresse
 * qui en possède déjà un — le cas d'une personne retirée de l'équipe puis
 * réinvitée — il n'y a rien à créer : le compte est rattaché à la boutique et la
 * personne se reconnecte avec son mot de passe habituel.
 *
 * Les rendre obligatoires ici reviendrait à demander un mot de passe pour un
 * compte existant, donc soit à l'ignorer en silence, soit à permettre à qui
 * envoie l'invitation de le redéfinir — une prise de contrôle de compte.
 * Le résolveur ne touche jamais au mot de passe d'un compte existant.
 */
export const acceptInvitationInputSchema = z.object({
  token: z.string().min(1, "Token requis"),
  name: z.string().min(1, "Le nom est requis").optional(),
  password: z
    .string()
    .min(8, "Le mot de passe doit faire au moins 8 caractères")
    .optional(),
});

export type CreateInvitationInput = z.infer<typeof createInvitationInputSchema>;
export type GetInvitationByTokenInput = z.infer<typeof getInvitationByTokenInputSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationInputSchema>;
