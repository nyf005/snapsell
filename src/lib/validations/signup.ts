import { z } from "zod";

export const signupInputSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z
    .string()
    .min(8, "Le mot de passe doit faire au moins 8 caractères"),
  tenantName: z.string().min(1, "Le nom de la boutique est requis"),
  name: z.string().optional(),
});

export type SignupInput = z.infer<typeof signupInputSchema>;

/**
 * Valide les champs signup côté client (même schéma que le serveur).
 * Retourne les erreurs par champ ou null si valide.
 */
export function getSignupValidationErrors(data: {
  email: string;
  password: string;
  tenantName: string;
  name?: string;
}): Record<string, string> | null {
  const result = signupInputSchema.safeParse(data);
  if (result.success) return null;
  const err: Record<string, string> = {};
  const fieldErrors = result.error.flatten().fieldErrors;
  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (messages?.[0]) err[key] = messages[0];
  }
  return err;
}
