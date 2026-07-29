import { z } from "zod";

import { ASSIGNABLE_ROLES } from "~/lib/rbac";

export const createInvitationInputSchema = z.object({
  email: z.string().email("Adresse email invalide").transform((s) => s.trim().toLowerCase()),
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

export const acceptInvitationInputSchema = z.object({
  token: z.string().min(1, "Token requis"),
  name: z.string().min(1, "Le nom est requis"),
  password: z.string().min(8, "Le mot de passe doit faire au moins 8 caractères"),
});

export type CreateInvitationInput = z.infer<typeof createInvitationInputSchema>;
export type GetInvitationByTokenInput = z.infer<typeof getInvitationByTokenInputSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationInputSchema>;
