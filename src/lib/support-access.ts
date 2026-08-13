/**
 * Autorise les outils de dépannage WhatsApp par adresse, côté serveur.
 *
 * Le rôle OPS ne peut pas porter de `tenantId` et ne peut donc pas ouvrir les
 * réglages d'une boutique. Cette liste permet à un compte support rattaché à la
 * boutique d'accéder aux outils sensibles, sans créer un rôle hybride.
 */
export function isWhatsAppSupportEmail(
  email: string | null | undefined,
  allowlist = process.env.WHATSAPP_SUPPORT_EMAILS,
): boolean {
  if (!email || !allowlist) return false;

  const normalizedEmail = email.trim().toLowerCase();
  return allowlist
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalizedEmail);
}
