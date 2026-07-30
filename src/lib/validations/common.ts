import { z } from "zod";

/**
 * Standard ID schema for all entities.
 */
export const idSchema = z.string().min(1, "L’identifiant est requis");

/**
 * Common phone schema, transformed to trim whitespace.
 */
export const phoneStringSchema = z
  .string()
  // Même ordre que les autres : trim d'abord, longueur ensuite. Sinon un numéro
  // fait d'espaces passait la validation et devenait vide.
  .trim()
  .min(1, "Le numéro est requis");
