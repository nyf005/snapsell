import { z } from "zod";

// Côte d'Ivoire : communes identifiées par nom (pas de code)
const communeNameSchema = z
  .string()
  .min(1, "Le nom de la commune est requis")
  .max(200, "Maximum 200 caractères")
  .transform((s) => s.trim());

export const upsertDeliveryZoneInputSchema = z.object({
  id: z.string().optional(), // si fourni = update
  name: z.string().min(1, "Le nom de la zone est requis").max(100).transform((s) => s.trim()),
  amount: z.number().int().min(0, "Le montant ne peut pas être négatif"),
  communeNames: z.array(communeNameSchema),
});

export const deleteDeliveryZoneInputSchema = z.object({
  zoneId: z.string(),
});

export const upsertDeliveryFeeCommuneInputSchema = z.object({
  communeName: communeNameSchema,
  amount: z.number().int().min(0, "Le montant ne peut pas être négatif"),
});

export const deleteDeliveryFeeCommuneInputSchema = z.object({
  communeName: z.string(),
});

/** Tarif unique pour l'intérieur du pays (hors Abidjan). */
export const setInteriorDeliveryFeeInputSchema = z.object({
  amount: z.number().int().min(0, "Le montant ne peut pas être négatif"),
});

/** Input pour list paginée zones */
export const listDeliveryZonesInputSchema = z.object({
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().cuid().optional(),
});

/** Input pour list paginée communes */
export const listDeliveryCommunesInputSchema = z.object({
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().cuid().optional(),
});

export type UpsertDeliveryZoneInput = z.infer<typeof upsertDeliveryZoneInputSchema>;
export type UpsertDeliveryFeeCommuneInput = z.infer<typeof upsertDeliveryFeeCommuneInputSchema>;
export type ListDeliveryZonesInput = z.infer<typeof listDeliveryZonesInputSchema>;
export type ListDeliveryCommunesInput = z.infer<typeof listDeliveryCommunesInputSchema>;
