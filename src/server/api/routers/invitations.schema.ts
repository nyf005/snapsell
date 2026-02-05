import { z } from "zod";

export const createInvitationInputSchema = z.object({
  email: z.string().email("Adresse email invalide").transform((s) => s.trim().toLowerCase()),
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
