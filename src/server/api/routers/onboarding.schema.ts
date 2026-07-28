import { z } from "zod";

/** Identifiants des étapes de mise en route, dans l'ordre d'affichage. */
export const SETUP_STEP_IDS = [
  "whatsapp",
  "prices",
  "delivery",
  "replies",
  "sellerPhone",
  "firstSale",
] as const;

export type SetupStepId = (typeof SETUP_STEP_IDS)[number];

export const setupStepSchema = z.object({
  id: z.enum(SETUP_STEP_IDS),
  done: z.boolean(),
  /** Une étape requise bloque le fonctionnement du robot tant qu'elle n'est pas faite. */
  required: z.boolean(),
});

export const onboardingStatusOutputSchema = z.object({
  steps: z.array(setupStepSchema),
  doneCount: z.number(),
  totalCount: z.number(),
  /** Toutes les étapes sont faites → la checklist disparaît définitivement. */
  isComplete: z.boolean(),
  /**
   * WhatsApp est connecté. Tant que c'est faux, aucun message ne peut arriver :
   * le tableau de bord masque ses indicateurs, qui valent zéro par construction.
   */
  whatsappConnected: z.boolean(),
});

export type OnboardingStatusOutput = z.infer<typeof onboardingStatusOutputSchema>;
