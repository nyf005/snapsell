/**
 * Couche vocabulaire de l'interface vendeur.
 *
 * Point d'entrée unique : `import { ui, formatError, formatXof } from "~/lib/copy"`.
 *
 * Voir `glossary.ts` pour la règle de registre (le bot dit « tu » à la cliente,
 * le web dit « vous » à la vendeuse) et le vocabulaire canonique.
 */

export { ui, errorCopy } from "./glossary";
export { term, BANNED_TERMS, BANNED_AGREEMENTS } from "./vocabulary";
export {
  HELP_TOPICS,
  HELP_FAMILIES,
  helpTopic,
  helpForRoute,
  helpTopicsFor,
  helpTopicsByFamily,
} from "./help";
export type { HelpBlock, HelpFamily, HelpRole, HelpTopic } from "./help";
export { formatError, formatErrorText } from "./errors";
export type { UserError, ErrorContext } from "./errors";
export {
  formatXof,
  formatXofUnits,
  formatXofUnitsParts,
  formatCreditCount,
  formatDate,
  formatDateShort,
  formatDateCompact,
  formatDateTime,
  formatRelativeDate,
  pluralize,
} from "./format";
export {
  templateStatusLabel,
  templateCategoryLabel,
  roleLabel,
  roleDescription,
  humanizeEventType,
} from "./terms";
