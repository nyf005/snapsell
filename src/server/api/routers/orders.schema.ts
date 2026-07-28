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
    /**
     * Un ou plusieurs états. La liste sert à la vue « À traiter », qui réunit
     * `confirmed_pending_deposit` et `confirmed` — voir src/lib/copy/orders.ts.
     */
    status: z.union([orderStatusSchema, z.array(orderStatusSchema).min(1)]).optional(),
    dateFrom: dateOptionalSchema,
    dateTo: dateOptionalSchema,
    limit: z.number().min(1).max(100).default(20),
    cursor: z.string().cuid().optional(),
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

/** Output pour list paginée */
export const orderOutputSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  status: z.string(),
  depositStatus: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  reservationId: z.string(),
  clientPhone: z.string(),
  deliveryAddress: z.string().nullable(),
  deliveryAddressCity: z.string().nullable(),
  deliveryAddressCommune: z.string().nullable(),
  deliveryAddressZone: z.string().nullable(),
  deliveryAddressDetails: z.string().nullable(),
  liveItemCode: z.string().nullable(),
});

export type OrderOutput = z.infer<typeof orderOutputSchema>;

export const listOrdersOutputSchema = z.object({
  items: z.array(orderOutputSchema),
  nextCursor: z.string().cuid().optional(),
});
