/**
 * Helper OptOut pour respect STOP scope tenant (Story 2.5)
 * Vérification avant envoi : ne pas envoyer si le client a envoyé STOP (scope = tenant)
 */

import { db } from "~/server/db";
import { normalizeAndValidatePhoneNumber } from "~/lib/validations/phone";

/** Enlève le préfixe "whatsapp:" (cohérent avec webhook-processor / MessageOut.to) */
function stripWhatsAppPrefix(phoneNumber: string): string {
  return phoneNumber.replace(/^whatsapp:/i, "");
}

/**
 * Normalise un numéro pour lookup OptOut (format E.164, cohérent avec MessageOut.to).
 * Strip préfixe whatsapp:, puis valide E.164. Si invalide, retourne la chaîne sans préfixe (fallback).
 * Hypothèse : MessageOut.to est toujours stocké en E.164 ; sinon risque de faux négatif (envoi alors qu'opt-out).
 */
function normalizePhoneForOptOut(phoneNumber: string): string {
  const withoutPrefix = stripWhatsAppPrefix(phoneNumber);
  try {
    return normalizeAndValidatePhoneNumber(withoutPrefix);
  } catch {
    return withoutPrefix;
  }
}

/**
 * Vérifie si le numéro a opt-out (STOP) pour ce tenant.
 * Utilisée par outbox-sender avant appel MessagingProvider.send().
 *
 * @param tenantId - ID du tenant
 * @param phoneNumber - Numéro destinataire (format E.164 ou avec préfixe whatsapp:)
 * @returns true si OptOut existe (ne pas envoyer), false sinon
 */
export async function checkOptOut(
  tenantId: string,
  phoneNumber: string,
): Promise<boolean> {
  const normalized = normalizePhoneForOptOut(phoneNumber);
  const found = await db.optOut.findUnique({
    where: {
      tenantId_phoneNumber: { tenantId, phoneNumber: normalized },
    },
  });
  return found != null;
}
