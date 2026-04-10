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
  type ListEventLogsInput,
} from "./eventLog.schema";
import { buildEventLogWhere } from "~/server/events/buildEventLogWhere";

/** Plafond export CSV (CR 6-5) : évite timeout / OOM. */
const EXPORT_CSV_MAX_ROWS = 10_000;

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
      const opts: Partial<ListEventLogsInput> = input ?? {};
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
      const role = ctx.session.user.role as string | undefined;
      if (role !== "OWNER" && role !== "MANAGER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Seuls les managers ou propriétaires peuvent exporter le journal en CSV.",
        });
      }
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant non identifié.",
        });
      }
      const tenantFeatures = await db.tenant.findUnique({
        where: { id: tenantId },
        select: { hasExportCsv: true },
      });
      if (!tenantFeatures?.hasExportCsv) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "L'export CSV est disponible à partir du plan Starter.",
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
