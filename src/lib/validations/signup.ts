import { z } from "zod";

/**
 * L'adresse est mise en minuscules et détourée ici — voir la note détaillée sur
 * `loginInputSchema` : les deux schémas doivent normaliser de la même façon,
 * sinon un compte créé ici reste introuvable à la connexion.
 */
export const signupInputSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalide"),
  password: z
    .string()
    .min(8, "Le mot de passe doit faire au moins 8 caractères"),
  tenantName: z.string().min(1, "Le nom de la boutique est requis"),
  name: z.string().optional(),
});

export type SignupInput = z.infer<typeof signupInputSchema>;

/**
 * Changement de mot de passe par une personne déjà connectée.
 *
 * Le mot de passe actuel est exigé, et il l'est pour une raison précise : une
 * session ouverte sur un poste laissé sans surveillance ne doit pas suffire à
 * verrouiller le compte de quelqu'un d'autre. La même règle de longueur que
 * l'inscription s'applique — il n'y a pas de raison qu'un mot de passe choisi
 * plus tard soit plus faible que le premier.
 */
export const changePasswordInputSchema = z
  .object({
    currentPassword: z.string().min(1, "Le mot de passe actuel est requis"),
    newPassword: z
      .string()
      .min(8, "Le nouveau mot de passe doit faire au moins 8 caractères"),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "Le nouveau mot de passe doit être différent de l'actuel",
    path: ["newPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

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
