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
  description: z.string().min(1, "La description est requise").max(500).optional(),
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

export const connectWhatsAppEmbeddedInputSchema = z.object({
  code: z.string().trim().min(1, "Le code OAuth est requis").max(4096),
});

export type CategoryPriceItemInput = z.infer<typeof categoryPriceItemSchema>;
export type SetCategoryPricesInput = z.infer<typeof setCategoryPricesInputSchema>;
export type SetMetaConfigInput = z.infer<typeof setMetaConfigInputSchema>;
export type ConnectWhatsAppEmbeddedInput = z.infer<
  typeof connectWhatsAppEmbeddedInputSchema
>;

/** Phase 5.3: FAQ settings per tenant. Each field is an optional freetext answer. */
export const setFaqSettingsInputSchema = z.object({
  faqDelivery: z.string().max(1000).nullable().optional(),
  faqPayment: z.string().max(1000).nullable().optional(),
  faqLocation: z.string().max(1000).nullable().optional(),
  faqAvailability: z.string().max(1000).nullable().optional(),
});

export type SetFaqSettingsInput = z.infer<typeof setFaqSettingsInputSchema>;

/** Input pour list paginée category prices */
export const listCategoryPricesInputSchema = z.object({
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().cuid().optional(),
});

export type ListCategoryPricesInput = z.infer<typeof listCategoryPricesInputSchema>;

const timeHHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format HH:MM requis (ex: 08:00)")
  .nullable()
  .optional();

export const setBusinessConfigInputSchema = z.object({
  businessHoursStart: timeHHMM,
  businessHoursEnd: timeHHMM,
  businessTimezone: z.string().max(64).nullable().optional(),
  awayMessage: z.string().max(2000).nullable().optional(),
});

export type SetBusinessConfigInput = z.infer<typeof setBusinessConfigInputSchema>;

export const selectMetaCatalogInputSchema = z.object({
  catalogId: z.string().trim().min(1, "L'identifiant du catalogue est requis").max(64),
  catalogName: z.string().trim().max(255).optional(),
});