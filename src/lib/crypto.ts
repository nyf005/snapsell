/**
 * Chiffrement AES-256-GCM pour données sensibles at-rest (ex: metaAccessToken).
 *
 * Format d'un token chiffré: enc:<iv_b64url>:<auth_tag_b64url>:<ciphertext_b64url>
 *
 * ENCRYPTION_KEY doit être une chaîne hexadécimale de 64 caractères (32 bytes).
 * Générer avec: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * En dev/test sans ENCRYPTION_KEY, encrypt() retourne la valeur en clair (graceful degradation).
 * En production, ENCRYPTION_KEY est requise (enforced par env.js).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:";

function getKey(): Buffer | null {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) return null;
  return Buffer.from(keyHex, "hex");
}

/**
 * Chiffre une chaîne en clair avec AES-256-GCM.
 * Retourne une chaîne préfixée "enc:" contenant IV + auth tag + ciphertext.
 * En dev/test sans ENCRYPTION_KEY, retourne la valeur en clair.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ENCRYPTION_KEY doit être une chaîne hex de 64 caractères (32 bytes). " +
          "Générer avec: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      );
    }
    return plaintext; // dev/test : stocker en clair
  }
  const iv = randomBytes(12); // 96-bit IV recommandé pour GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}:${authTag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

/**
 * Déchiffre une chaîne chiffrée par encrypt().
 * Si la chaîne ne commence pas par "enc:", elle est retournée telle quelle
 * (compatibilité avec les valeurs legacy ou non chiffrées en dev).
 */
export function decrypt(encrypted: string): string {
  if (!encrypted.startsWith(PREFIX)) {
    // Valeur non chiffrée (legacy ou dev sans clé) — retourner telle quelle
    return encrypted;
  }
  const key = getKey();
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY requise pour déchiffrer une valeur chiffrée (enc:...).",
    );
  }
  const rest = encrypted.slice(PREFIX.length);
  const colonIndex1 = rest.indexOf(":");
  const colonIndex2 = rest.indexOf(":", colonIndex1 + 1);
  if (colonIndex1 === -1 || colonIndex2 === -1) {
    throw new Error("Format de valeur chiffrée invalide");
  }
  const ivB64 = rest.slice(0, colonIndex1);
  const authTagB64 = rest.slice(colonIndex1 + 1, colonIndex2);
  const ciphertextB64 = rest.slice(colonIndex2 + 1);

  const iv = Buffer.from(ivB64, "base64url");
  const authTag = Buffer.from(authTagB64, "base64url");
  const ciphertext = Buffer.from(ciphertextB64, "base64url");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
    "utf8",
  );
}

/**
 * Retourne true si la valeur a déjà été chiffrée par encrypt().
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}
