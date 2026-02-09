/**
 * Story 6.5: Lecture Event Log (list, export CSV). Isolation tenant stricte.
 * La création des événements est dans ~/server/events/eventLog.ts.
 */

import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  listEventLogsInputSchema,
  exportCsvEventLogsInputSchema,
} from "./eventLog.schema";

/** Plafond export CSV (CR 6-5) : évite timeout / OOM. */
const EXPORT_CSV_MAX_ROWS = 10_000;

type EventLogWhereInput = Parameters<typeof db.eventLog.findMany>[0]["where"];

/** Construit le where pour list et exportCsv (évite duplication). */
function buildEventLogWhere(
  tenantId: string,
  opts: {
    eventType?: string;
    dateFrom?: string;
    dateTo?: string;
    correlationId?: string;
  },
): EventLogWhereInput {
  const where: EventLogWhereInput = { tenantId };
  if (opts.eventType) {
    where.eventType = opts.eventType;
  }
  if (opts.correlationId) {
    where.correlationId = opts.correlationId;
  }
  if (opts.dateFrom ?? opts.dateTo) {
    where.createdAt = {};
    if (opts.dateFrom) {
      const from = new Date(opts.dateFrom);
      from.setUTCHours(0, 0, 0, 0);
      (where.createdAt as Record<string, Date>).gte = from;
    }
    if (opts.dateTo) {
      const to = new Date(opts.dateTo);
      to.setUTCHours(23, 59, 59, 999);
      (where.createdAt as Record<string, Date>).lte = to;
    }
  }
  return where;
}

export const eventLogRouter = createTRPCRouter({
  /** Liste paginée des événements avec filtres. */
  list: protectedProcedure
    .input(listEventLogsInputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant non identifié.",
        });
      }
      const opts = input ?? {};
      const limit = opts.limit ?? 50;
      const where = buildEventLogWhere(tenantId, opts);
      const rows = await db.eventLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        skip: opts.cursor ? 1 : 0,
        cursor: opts.cursor ? { id: opts.cursor } : undefined,
      });
      const items = rows.slice(0, limit).map((row) => ({
        id: row.id,
        eventType: row.eventType,
        entityType: row.entityType,
        entityId: row.entityId,
        correlationId: row.correlationId,
        actorType: row.actorType,
        payload: row.payload,
        createdAt: row.createdAt,
      }));
      const nextCursor =
        rows.length > limit ? rows[limit - 1]?.id ?? undefined : undefined;
      return { items, nextCursor };
    }),

  /** Export CSV audit trail. Mêmes filtres que list (sans pagination), plafonné. */
  exportCsv: protectedProcedure
    .input(exportCsvEventLogsInputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant non identifié.",
        });
      }
      const opts = input ?? {};
      const where = buildEventLogWhere(tenantId, opts);
      const rows = await db.eventLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: EXPORT_CSV_MAX_ROWS + 1,
      });
      if (rows.length > EXPORT_CSV_MAX_ROWS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Trop d'événements (max ${EXPORT_CSV_MAX_ROWS}). Affinez les filtres (type, période, correlationId).`,
        });
      }
      const escapeCsv = (value: string | number | Date | object | null) => {
        const s =
          value == null
            ? ""
            : typeof value === "object"
              ? JSON.stringify(value)
              : String(value);
        if (s.includes(",") || s.includes("\n") || s.includes('"')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };
      const headers = [
        "eventType",
        "entityType",
        "entityId",
        "correlationId",
        "actorType",
        "createdAt",
        "payload",
      ];
      const csvRows = rows.map((row) => [
        row.eventType,
        row.entityType,
        row.entityId ?? "",
        row.correlationId,
        row.actorType,
        row.createdAt.toISOString(),
        escapeCsv(row.payload as object),
      ]);
      const csvLines = [
        headers.join(","),
        ...csvRows.map((r) => r.join(",")),
      ];
      const csv = "\uFEFF" + csvLines.join("\n");
      const filename = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
      return { csv, filename };
    }),
});
