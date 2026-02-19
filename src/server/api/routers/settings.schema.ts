import { z } from "zod";

/** Code catégorie : libre (lettre, mot ou libellé composé, ex. A, Premium, Haut de gamme), 1–50 caractères. */
const categoryCodeSchema = z
  .string()
  .min(1, "La catégorie est requise")
  .max(50, "Maximum 50 caractères")
  .transform((s) => s.trim());

export const categoryPriceItemSchema = z.object({
  categoryLetter: categoryCodeSchema,
  amount: z.number().int().min(0, "Le montant ne peut pas être négatif"),
  description: z.string().max(500).optional(),
});

export const setCategoryPricesInputSchema = z
  .object({
    items: z.array(categoryPriceItemSchema),
  })
  .refine(
    (data) => {
      const codes = data.items.map((i) => i.categoryLetter);
      return new Set(codes).size === codes.length;
    },
    { message: "Chaque catégorie ne doit apparaître qu’une seule fois (pas de doublons).", path: ["items"] }
  );

/** Schema Meta WhatsApp Cloud API config (Story 10.1). */
const nullableStringTrimmed = z
  .union([z.string(), z.null()])
  .transform((s) => (s === "" || s == null ? null : String(s).trim()));

export const setMetaConfigInputSchema = z.object({
  metaPhoneNumberId: nullableStringTrimmed,
  metaWabaId: nullableStringTrimmed,
  metaAccessToken: nullableStringTrimmed,
});

export type CategoryPriceItemInput = z.infer<typeof categoryPriceItemSchema>;
export type SetCategoryPricesInput = z.infer<typeof setCategoryPricesInputSchema>;
export type SetMetaConfigInput = z.infer<typeof setMetaConfigInputSchema>;