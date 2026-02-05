import { z } from "zod";

/**
 * Regex pour valider le format E.164 des numéros de téléphone
 * Format: +[code pays][numéro] (ex: +33612345678)
 * - Commence par +
 * - Code pays: 1-9 suivi de 1-14 chiffres
 * - Total: 1-15 chiffres après le +
 */
const E164_REGEX = /^\+[1-9]\d{1,14}$/;

/**
 * Schéma Zod pour valider un numéro de téléphone au format E.164
 */
export const e164PhoneSchema = z
  .string()
  .regex(E164_REGEX, "Le numéro doit être au format E.164 (ex: +33612345678)");

/**
 * Valide qu'un numéro de téléphone est au format E.164
 * @param phoneNumber - Numéro à valider
 * @returns true si valide, false sinon
 */
export function isValidE164(phoneNumber: string): boolean {
  return E164_REGEX.test(phoneNumber);
}

/**
 * Normalise un numéro de téléphone en enlevant le préfixe "whatsapp:" si présent
 * et valide le format E.164
 * @param phoneNumber - Numéro à normaliser
 * @returns Numéro normalisé (format E.164)
 * @throws Error si le numéro normalisé n'est pas au format E.164
 */
export function normalizeAndValidatePhoneNumber(phoneNumber: string): string {
  // Enlever préfixe "whatsapp:" (case-insensitive)
  const normalized = phoneNumber.replace(/^whatsapp:/i, "");

  // Valider format E.164
  if (!isValidE164(normalized)) {
    throw new Error(
      `Numéro de téléphone invalide: "${phoneNumber}" (normalisé: "${normalized}"). Format attendu: E.164 (ex: +33612345678)`,
    );
  }

  return normalized;
}
