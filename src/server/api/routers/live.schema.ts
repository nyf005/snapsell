import { z } from "zod";

/** Format CUID (Prisma @default(cuid())) : c + alphanumerique, 20–36 caractères. */
const cuidSchema = z
  .string()
  .min(20, "ID invalide")
  .max(36, "ID invalide")
  .regex(/^c[a-z0-9]+$/i, "ID invalide (format CUID attendu)");

/** Input pour libérer une réservation (vendeur). */
export const releaseReservationInputSchema = z.object({
  reservationId: cuidSchema,
});

export type ReleaseReservationInput = z.infer<typeof releaseReservationInputSchema>;
