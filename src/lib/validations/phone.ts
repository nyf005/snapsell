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
 * Masque un numéro pour l'affichage ou la journalisation : `***1234`.
 *
 * Les quatre derniers chiffres suffisent à rapprocher un numéro d'une conversation
 * quand on diagnostique, sans conserver la donnée personnelle. C'est le compromis
 * que l'export CSV avait déjà retenu — la fonction y vivait en copie privée, elle
 * est désormais partagée avec le logger.
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***${digits.slice(-4)}`;
}

/**
 * Table de correspondance ARTCI : préfixe 2 chiffres (ancien) → préfixe opérateur (nouveau)
 * Source : annexe ARTCI/UIT — migration nationale CI de 8 à 10 chiffres (2021)
 *
 * Moov / Atlantique Telecom CI → 01
 * MTN CI                       → 05
 * Orange CI                    → 07
 *
 * Note : la portabilité permet de changer d'opérateur en gardant son numéro.
 * Ce mapping reflète l'attribution initiale, pas nécessairement l'opérateur actuel.
 */
const CI_OLD_PREFIX_TO_NEW: Record<string, string> = {
  // Moov → 01
  "01": "01", "02": "01", "03": "01",
  "40": "01", "41": "01", "42": "01", "43": "01",
  "50": "01", "51": "01", "52": "01", "53": "01",
  "70": "01", "71": "01", "72": "01", "73": "01",
  // MTN → 05
  "04": "05", "05": "05", "06": "05",
  "44": "05", "45": "05", "46": "05",
  "54": "05", "55": "05", "56": "05",
  "64": "05", "65": "05", "66": "05",
  "74": "05", "75": "05", "76": "05",
  "84": "05", "85": "05", "86": "05",
  "94": "05", "95": "05", "96": "05",
  // Orange → 07
  "07": "07", "08": "07", "09": "07",
  "47": "07", "48": "07", "49": "07",
  "57": "07", "58": "07", "59": "07",
  "67": "07", "68": "07", "69": "07",
  "77": "07", "78": "07", "79": "07",
  "87": "07", "88": "07", "89": "07",
  "97": "07", "98": "07",
};

/**
 * Migration des numéros Côte d'Ivoire (+225) de l'ancien format 8 chiffres
 * vers le nouveau format 10 chiffres (migration nationale ARTCI 2021).
 *
 * Ex : +22509542783  (ancien Orange 09…) → +2250709542783 (07 + 09542783)
 *      +22554123456  (ancien MTN 54…)    → +2250554123456 (05 + 54123456)
 *      +22570123456  (ancien Moov 70…)   → +2250170123456 (01 + 70123456)
 *
 * Les numéros déjà en 10 chiffres (+225 + 10 chiffres) sont retournés sans modification.
 *
 * @param phoneNumber - Numéro E.164 à migrer si nécessaire
 * @returns Numéro au format 10 chiffres CI ou numéro inchangé si pas CI / déjà migré / préfixe inconnu
 */
export function migrateCIPhoneNumber(phoneNumber: string): string {
  // Uniquement les numéros CI avec exactement 8 chiffres après +225
  const match = phoneNumber.match(/^\+225(\d{8})$/);
  if (!match) return phoneNumber;

  const localNumber = match[1]!;
  const twoDigitPrefix = localNumber.substring(0, 2);
  const newPrefix = CI_OLD_PREFIX_TO_NEW[twoDigitPrefix];

  // Préfixe inconnu dans la table ARTCI → retourner tel quel sans modifier
  if (!newPrefix) return phoneNumber;

  return `+225${newPrefix}${localNumber}`;
}



/**
 * Fonction MAÎTRE de normalisation pour SnapSell.
 * À utiliser pour TOUT numéro entrant (webhook, saisie manuelle, etc).
 * 
 * Actions :
 * 1. Nettoyage du préfixe "whatsapp:"
 * 2. Migration Côte d'Ivoire (8 -> 10 chiffres) pour garantir l'uniformité en DB
 * 3. Validation stricte du format E.164
 * 
 * @param phoneNumber - Numéro brut (ex: "whatsapp:+22509542783")
 * @returns Numéro normalisé et migré (ex: "+2250709542783")
 */
export function normalizeIncomingPhone(phoneNumber: string): string {
  // 1. Nettoyage préfixe
  const clean = phoneNumber.replace(/^whatsapp:/i, "");

  // 2. Migration CI (8 -> 10 chiffres)
  const migrated = migrateCIPhoneNumber(clean);

  // 3. Validation
  if (!isValidE164(migrated)) {
    throw new Error(
      `Format de téléphone invalide: "${phoneNumber}" (normalisé: "${migrated}"). E.164 attendu (+...)`,
    );
  }

  return migrated;
}

/**
 * Normalise un numéro provenant de Meta (enlève tout sauf chiffres et +).
 * @param phone - Numéro brut de Meta (ex: "+33 6 12 34 56 78")
 * @returns Numéro normalisé via normalizeIncomingPhone
 */
export function normalizeMetaPhone(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, "");
  const withPlus = cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
  return normalizeIncomingPhone(withPlus);
}

