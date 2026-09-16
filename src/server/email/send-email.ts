import { env } from "~/env";
import { createLogger } from "~/lib/logger";

const emailLogger = createLogger("Email");

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: "not_configured" | "provider_error" };

export function isEmailConfigured(): boolean {
  return !!(env.RESEND_API_KEY && env.EMAIL_FROM);
}

/** Appel REST direct : une seule route, pas de SDK à maintenir pour ça. */
export async function sendEmail(message: EmailMessage): Promise<SendEmailResult> {
  if (!isEmailConfigured()) return { ok: false, reason: "not_configured" };

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
    });
  } catch {
    emailLogger.error("Envoi email impossible : fournisseur injoignable");
    return { ok: false, reason: "provider_error" };
  }

  if (!response.ok) {
    emailLogger.error("Envoi email refusé par le fournisseur", { status: response.status });
    return { ok: false, reason: "provider_error" };
  }

  const data = (await response.json().catch(() => null)) as { id?: string } | null;
  return { ok: true, id: data?.id ?? null };
}
