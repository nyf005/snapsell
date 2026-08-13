/**
 * Story 6.5: Schémas pour lecture Event Log (list, export CSV).
 * Filtres optionnels : eventType, dateFrom, dateTo, correlationId. Pagination cursor.
 */

import { z } from "zod";

const dateOptionalSchema = z
  .string()
  .optional()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), {
    message: "Date invalide",
  });

export const eventTypeEnumSchema = z.enum([
  "webhook_received",
  "message_sent",
  "idempotent_ignored",
  "opt_out_recorded",
  "message_blocked_optout",
  "live_session_created",
  "live_session_closed",
  "live_item_created",
  "live_item_duplicate_rejected",
  "live_item_photo_linked",
  "reservation_hold",
  "reservation_released",
  "reservation_confirmed",
  "reservation_started",
  "reservation_expired",
  "waitlist_promoted",
  "reservation_reminder_sent",
  "order_created",
  "deposit_requested",
  "order.status_changed",
  "deposit_approved",
  "deposit_rejected",
  "assistant.activated",
  "assistant.paused",
  "assistant.message_suppressed",
]);

export const listEventLogsInputSchema = z
  .object({
    eventType: eventTypeEnumSchema.optional(),
    dateFrom: dateOptionalSchema,
    dateTo: dateOptionalSchema,
    correlationId: z.string().min(1).optional(),
    limit: z.number().min(1).max(100).default(50),
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
    {
      message:
        "La date de début doit être antérieure ou égale à la date de fin.",
    },
  );

/** Mêmes critères que list pour l'export CSV audit. */
export const exportCsvEventLogsInputSchema = z
  .object({
    eventType: eventTypeEnumSchema.optional(),
    dateFrom: dateOptionalSchema,
    dateTo: dateOptionalSchema,
    correlationId: z.string().min(1).optional(),
  })
  .optional()
  .refine(
    (v) => {
      if (!v?.dateFrom || !v?.dateTo) return true;
      const from = Date.parse(v.dateFrom);
      const to = Date.parse(v.dateTo);
      return !Number.isNaN(from) && !Number.isNaN(to) && from <= to;
    },
    {
      message:
        "La date de début doit être antérieure ou égale à la date de fin.",
    },
  );

export type ListEventLogsInput = z.infer<typeof listEventLogsInputSchema>;
export type ExportCsvEventLogsInput = z.infer<
  typeof exportCsvEventLogsInputSchema
>;
