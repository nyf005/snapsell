import { z } from "zod";
import { idSchema } from "~/lib/validations/common";

/** Création d'un article catalogue (dashboard) */
export const createCatalogueItemInputSchema = z.object({
  code: z.string().trim().min(1, "Code requis"),
  quantity: z.number().int().min(1, "Quantité doit être >= 1"),
  amount: z.number().int().nullable().optional(),
  mediaStorageKey: z.string().nullable().optional(),
});

/** Mise à jour d'un article catalogue (dashboard) */
export const updateCatalogueItemInputSchema = z.object({
  id: idSchema,
  code: z.string().trim().min(1, "Code requis").optional(),
  quantity: z.number().int().min(0, "Quantité doit être >= 0").optional(),
  amount: z.number().int().nullable().optional(),
  mediaStorageKey: z.string().nullable().optional(),
});

/** Suppression d'un article catalogue (dashboard) */
export const deleteCatalogueItemInputSchema = z.object({
  id: idSchema,
});

/** Output : article catalogue pour le dashboard */
export const catalogueItemOutputSchema = z.object({
  id: z.string(),
  code: z.string(),
  amount: z.number().nullable(),
  quantity: z.number(),
  availableQty: z.number(),
  reservedQty: z.number(),
  mediaStorageKey: z.string().nullable(),
  attributes: z.array(z.string()).nullable().optional(),
  origin: z.enum(["live", "seller_whatsapp", "dashboard"]),
  createdInLive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CreateCatalogueItemInput = z.infer<typeof createCatalogueItemInputSchema>;
export type UpdateCatalogueItemInput = z.infer<typeof updateCatalogueItemInputSchema>;
export type DeleteCatalogueItemInput = z.infer<typeof deleteCatalogueItemInputSchema>;
export type CatalogueItemOutput = z.infer<typeof catalogueItemOutputSchema>;

/** Upsert d'une liste de variantes sur un article catalogue */
export const upsertVariantsInputSchema = z.object({
  catalogueItemId: idSchema,
  /** Dimensions de l'article (ex: ["Couleur", "Taille"]) — persisté sur `attributes` */
  dimensions: z.array(z.string().trim().min(1)).max(3),
  /** Variantes à créer / remplacer */
  variants: z.array(z.object({
    label: z.string().trim().min(1),
    values: z.record(z.string()),
    quantity: z.number().int().min(0),
  })).min(1).max(100),
});

export const deleteVariantsInputSchema = z.object({
  catalogueItemId: idSchema,
});

export const listVariantsInputSchema = z.object({
  catalogueItemId: idSchema,
});

export const itemVariantOutputSchema = z.object({
  id: z.string(),
  label: z.string(),
  values: z.record(z.string()),
  quantity: z.number(),
  availableQty: z.number(),
  reservedQty: z.number(),
});

export type UpsertVariantsInput = z.infer<typeof upsertVariantsInputSchema>;
export type ItemVariantOutput = z.infer<typeof itemVariantOutputSchema>;
