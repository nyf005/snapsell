/**
 * Aiguillage des évènements webhook Meta par leur `field`.
 *
 * Séparé du routeur HTTP pour être testable seul : la règle qui compte ici —
 * un écho n'est jamais une entrée — mérite d'être vérifiable sans monter une
 * requête, une signature et une base.
 */

export const META_WEBHOOK_FIELDS = {
  /** Message reçu d'une cliente. Seul champ qui alimente les automatisations. */
  MESSAGES: "messages",
  /** Message envoyé par la vendeuse depuis l'app WhatsApp Business. */
  MESSAGE_ECHOES: "smb_message_echoes",
  /** Contacts de l'app WhatsApp Business de la vendeuse. */
  APP_STATE_SYNC: "smb_app_state_sync",
  /** Historique de conversation importé après un onboarding Coexistence. */
  HISTORY: "history",
} as const;

export type MetaWebhookFieldKind =
  /** À traiter par le pipeline entrant. */
  | "inbound"
  /**
   * ── LES ÉCHOS NE SONT PAS DES ENTRÉES ──────────────────────────────────────
   *
   * `smb_message_echoes` porte les messages que **la vendeuse** a envoyés depuis
   * son téléphone. Les faire entrer dans le pipeline des messages clients
   * serait une faute grave : `webhook-processor.ts` répond automatiquement à ce
   * qu'il y reçoit — il compte trente-sept appels à `writeToOutbox`. SnapSell
   * répondrait donc à la vendeuse, dans la conversation, sous les yeux de sa
   * cliente.
   *
   * Cette catégorie existe pour rendre cette confusion impossible par
   * construction plutôt que par vigilance.
   * ──────────────────────────────────────────────────────────────────────────
   */
  | "echo"
  /** Reconnu, propre à la Coexistence, pas encore traité. */
  | "coexistence-sync"
  /** Inconnu : on le journalise nommément au lieu de le jeter en silence. */
  | "unknown";

export function classifyMetaWebhookField(field: string): MetaWebhookFieldKind {
  switch (field) {
    case META_WEBHOOK_FIELDS.MESSAGES:
      return "inbound";
    case META_WEBHOOK_FIELDS.MESSAGE_ECHOES:
      return "echo";
    case META_WEBHOOK_FIELDS.APP_STATE_SYNC:
    case META_WEBHOOK_FIELDS.HISTORY:
      return "coexistence-sync";
    default:
      return "unknown";
  }
}

/**
 * Vrai seulement pour les champs qui doivent atteindre le pipeline entrant.
 *
 * Point de passage unique et volontairement étroit : tout nouveau champ Meta
 * est hors du pipeline tant que quelqu'un ne l'a pas explicitement classé
 * `inbound` ci-dessus. Le défaut est sûr.
 */
export function isInboundMessageField(field: string): boolean {
  return classifyMetaWebhookField(field) === "inbound";
}
