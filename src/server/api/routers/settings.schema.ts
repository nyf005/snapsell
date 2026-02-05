import { z } from "zod";

/** Code catégorie : libre (lettre, mot ou libellé composé, ex. A, Premium, Haut de gamme), 1–50 caractères. */
const categoryCodeSchema = z
  .string()
  .min(1, "La catégorie est requise")
  .max(50, "Maximum 50 caractères")
  .transform((s) => s.trim());

export const categoryPriceItemSchema = z.object({
  categoryLetter: categoryCodeSchema,
  amountCents: z.number().int().min(0, "Le montant ne peut pas être négatif"),
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

/** Regex E.164 (ex. +33612345678). */
const E164_REGEX = /^\+[1-9]\d{6,14}$/;

/** Numéro WhatsApp au format international E.164 (ex. +33612345678). */
export const e164PhoneSchema = z
  .string()
  .min(1, "Le numéro est requis")
  .transform((s) => s.trim())
  .refine((v) => E164_REGEX.test(v), {
    message: "Format international requis (ex. +33612345678)",
  });

export const setWhatsAppConfigInputSchema = z.object({
  whatsappPhoneNumber: z
    .union([z.string(), z.null()])
    .transform((s) => (s === "" || s == null ? null : String(s).trim()))
    .refine((v) => v === null || E164_REGEX.test(v), {
      message: "Format international requis (ex. +33612345678)",
    }),
});

export type CategoryPriceItemInput = z.infer<typeof categoryPriceItemSchema>;
export type SetCategoryPricesInput = z.infer<typeof setCategoryPricesInputSchema>;
export type SetWhatsAppConfigInput = z.infer<typeof setWhatsAppConfigInputSchema>;
