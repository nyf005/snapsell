import { env } from "~/env";

/** Fenêtre d'inactivité en minutes (Story 2.6). Même valeur pour session courante et job de fermeture. MVP 30–60. */
const DEFAULT_INACTIVITY_WINDOW_MINUTES = 45;

export function getInactivityWindowMinutes(): number {
  return env.LIVE_SESSION_INACTIVITY_WINDOW_MINUTES ?? DEFAULT_INACTIVITY_WINDOW_MINUTES;
}
