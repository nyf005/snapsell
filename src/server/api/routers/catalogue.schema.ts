/**
 * Story 8.2 Task 2: Schémas Zod pour le router catalogue
 */

import { z } from "zod";

/** Création d'un article catalogue (dashboard) */
export const createCatalogueItemInputSchema = z.object({
  code: z.string().trim().min(1, "Code requis"),
  quantity: z.number().int().min(1, "Quantité doit être >= 1"),
  amountCents: z.number().int().nullable().optional(),
  mediaStorageKey: z.string().nullable().optional(),
});

/** Mise à jour d'un article catalogue (dashboard) */
export const updateCatalogueItemInputSchema = z.object({
  id: z.string().cuid("ID invalide"),
  code: z.string().trim().min(1, "Code requis").optional(),
  quantity: z.number().int().min(0, "Quantité doit être >= 0").optional(),
  amountCents: z.number().int().nullable().optional(),
  mediaStorageKey: z.string().nullable().optional(),
});

/** Suppression d'un article catalogue (dashboard) */
export const deleteCatalogueItemInputSchema = z.object({
  id: z.string().cuid("ID invalide"),
});

/** Output : article catalogue pour le dashboard */
export const catalogueItemOutputSchema = z.object({
  id: z.string(),
  code: z.string(),
  amountCents: z.number().nullable(),
  quantity: z.number(),
  availableQty: z.number(),
  reservedQty: z.number(),
  mediaStorageKey: z.string().nullable(),
  createdInLive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CreateCatalogueItemInput = z.infer<typeof createCatalogueItemInputSchema>;
export type UpdateCatalogueItemInput = z.infer<typeof updateCatalogueItemInputSchema>;
export type DeleteCatalogueItemInput = z.infer<typeof deleteCatalogueItemInputSchema>;
export type CatalogueItemOutput = z.infer<typeof catalogueItemOutputSchema>;
