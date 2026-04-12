import { z } from "zod";
import { idSchema } from "~/lib/validations/common";

const orderStatusSchema = z.enum([
  "confirmed",
  "confirmed_pending_deposit",
  "preparing",
  "in_delivery",
  "delivered",
  "cancelled",
]);

/** Optionnel : filtre liste par statut et plage createdAt (date-only ou ISO). */
const dateOptionalSchema = z
  .string()
  .optional()
  .refine(
    (v) => !v || !Number.isNaN(Date.parse(v)),
    { message: "Date invalide" },
  );

export const listOrdersInputSchema = z
  .object({
    status: orderStatusSchema.optional(),
    dateFrom: dateOptionalSchema,
    dateTo: dateOptionalSchema,
  })
  .optional()
  .refine(
    (v) => {
      if (!v?.dateFrom || !v?.dateTo) return true;
      const from = Date.parse(v.dateFrom);
      const to = Date.parse(v.dateTo);
      return !Number.isNaN(from) && !Number.isNaN(to) && from <= to;
    },
    { message: "La date de début doit être antérieure ou égale à la date de fin." },
  );

export const getOrderByIdInputSchema = z.object({
  orderId: idSchema,
});

export const updateOrderStatusInputSchema = z.object({
  orderId: idSchema,
  status: orderStatusSchema,
});

/** Story 6.5: même critères que list pour l'export CSV. */
export const exportCsvOrdersInputSchema = listOrdersInputSchema;

/** Phase 4.2: bulk marking statut sur plusieurs commandes */
export const bulkUpdateStatusInputSchema = z.object({
  orderIds: z.array(idSchema).min(1).max(200),
  status: orderStatusSchema,
});

export type ListOrdersInput = z.infer<typeof listOrdersInputSchema>;
export type GetOrderByIdInput = z.infer<typeof getOrderByIdInputSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusInputSchema>;
export type ExportCsvOrdersInput = z.infer<typeof exportCsvOrdersInputSchema>;
export type BulkUpdateStatusInput = z.infer<typeof bulkUpdateStatusInputSchema>;
