import { z } from "zod";

export const PASSWORD_RESET_PATH = "/reinitialiser-mot-de-passe";
export const FORGOT_PASSWORD_PATH = "/mot-de-passe-oublie";

export function buildPasswordResetPath(token: string): string {
  return `${PASSWORD_RESET_PATH}?token=${token}`;
}

/** Même normalisation que la connexion : sinon l'adresse saisie ne retrouve pas le compte. */
export const requestPasswordResetInputSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalide"),
});

export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetInputSchema>;

/** 32 octets aléatoires encodés en hexadécimal. */
export const PASSWORD_RESET_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export const resetPasswordInputSchema = z.object({
  token: z.string().regex(PASSWORD_RESET_TOKEN_PATTERN, "Ce lien n’est pas valide"),
  password: z
    .string()
    .min(8, "Le mot de passe doit faire au moins 8 caractères"),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

export function getResetPasswordValidationErrors(data: {
  token: string;
  password: string;
  confirmation: string;
}): Record<string, string> | null {
  const result = resetPasswordInputSchema.safeParse(data);
  const err: Record<string, string> = {};
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;
    for (const [key, messages] of Object.entries(fieldErrors)) {
      if (messages?.[0]) err[key] = messages[0];
    }
  }
  if (data.password !== data.confirmation) {
    err.confirmation = "Les deux mots de passe ne correspondent pas";
  }
  return Object.keys(err).length ? err : null;
}
