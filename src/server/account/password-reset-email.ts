import { env } from "~/env";
import { buildPasswordResetPath } from "~/lib/validations/password-reset";
import { isEmailConfigured, sendEmail, type SendEmailResult } from "~/server/email/send-email";
import { PASSWORD_RESET_TTL_MINUTES } from "./password-reset";

function appBaseUrl(): string | null {
  const raw = env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

/** L'email a besoin d'un lien absolu : sans URL publique, pas de réinitialisation par email. */
export function canSendPasswordResetEmail(): boolean {
  return isEmailConfigured() && appBaseUrl() !== null;
}

export function buildPasswordResetLink(token: string): string | null {
  const base = appBaseUrl();
  return base ? `${base}${buildPasswordResetPath(token)}` : null;
}

export async function sendPasswordResetEmail(
  to: string,
  token: string,
): Promise<SendEmailResult> {
  const link = buildPasswordResetLink(token);
  if (!link) return { ok: false, reason: "not_configured" };

  const text = [
    "Bonjour,",
    "",
    "Une demande de réinitialisation du mot de passe a été faite pour ce compte SnapSell.",
    "",
    `Pour choisir un nouveau mot de passe, ouvrez ce lien (valable ${PASSWORD_RESET_TTL_MINUTES} minutes) :`,
    link,
    "",
    "Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.",
    "",
    "L’équipe SnapSell",
  ].join("\n");

  return sendEmail({
    to,
    subject: "Réinitialisation de votre mot de passe SnapSell",
    text,
  });
}
