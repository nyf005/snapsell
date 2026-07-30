/**
 * Story 6.5: Lecture Event Log (list, export CSV). Isolation tenant stricte.
 * La création des événements est dans ~/server/events/eventLog.ts.
 */

import { TRPCError } from "@trpc/server";

import { canManageGrid } from "~/lib/rbac";
import { appError } from "~/server/api/errors";
import { db } from "~/server/db";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  listEventLogsInputSchema,
  exportCsvEventLogsInputSchema,
  type ListEventLogsInput,
} from "./eventLog.schema";
import { buildEventLogWhere } from "~/server/events/buildEventLogWhere";
import { getAuditRetentionDays } from "~/lib/subscription-plans";

/** Plafond export CSV (CR 6-5) : évite timeout / OOM. */
const EXPORT_CSV_MAX_ROWS = 10_000;

export const eventLogRouter = createTRPCRouter({
  /** Liste paginée des événements avec filtres. */
  list: protectedProcedure
    .input(listEventLogsInputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) {
        throw appError("UNAUTHORIZED", "session.expired");
      }
      const opts: Partial<ListEventLogsInput> = input ?? {};
      const limit = opts.limit ?? 50;
      // Profondeur du journal selon le plan : 30 j (Free), 90 j (Starter), illimité (Pro).
      const auditTenant = await db.tenant.findUnique({
        where: { id: tenantId },
        select: { subscriptionPlan: true },
      });
      const where = buildEventLogWhere(
        tenantId,
        opts,
        getAuditRetentionDays(auditTenant?.subscriptionPlan ?? "free"),
      );
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
      // `canManageGrid` et non une comparaison à la main : la liste des rôles de
      // gestion vit dans `~/lib/rbac`, et une copie inline ne suit pas ses
      // évolutions — c'est ainsi que le sélecteur d'acompte s'était désynchronisé.
      if (!canManageGrid(ctx.session.user.role as string)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Seuls les managers ou propriétaires peuvent exporter le journal en CSV.",
        });
      }
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) {
        throw appError("UNAUTHORIZED", "session.expired");
      }
      const tenantFeatures = await db.tenant.findUnique({
        where: { id: tenantId },
        select: { hasExportCsv: true, subscriptionPlan: true },
      });
      if (!tenantFeatures?.hasExportCsv) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "L'export CSV est disponible à partir du plan Starter.",
        });
      }
      const opts = input ?? {};
      // Même borne d'historique que la consultation : l'export ne doit pas être
      // une porte dérobée pour récupérer un journal plus profond que la liste.
      const where = buildEventLogWhere(
        tenantId,
        opts,
        getAuditRetentionDays(tenantFeatures.subscriptionPlan),
      );
      const rows = await db.eventLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: EXPORT_CSV_MAX_ROWS + 1,
      });
      if (rows.length > EXPORT_CSV_MAX_ROWS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Trop d'événements (max ${EXPORT_CSV_MAX_ROWS}). Réduisez la période ou choisissez un type d’activité.`,
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
