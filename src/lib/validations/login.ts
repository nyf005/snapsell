import { z } from "zod";

export const loginInputSchema = z.object({
  email: z.string().email("Email invalide"),
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
