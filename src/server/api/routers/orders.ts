/**
 * Story 5.2: Gestion des statuts de commande (list, getById, updateStatus).
 * Story 5.4: Notification cliente par WhatsApp sur delivered/cancelled.
 * Story 6.5: Export CSV commandes (manager/owner), même filtres que list.
 * Isolation tenant: tenantId toujours depuis ctx.session.user.tenantId (protectedProcedure).
 */

import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { createTRPCRouter, managerProcedure } from "~/server/api/trpc";
import {
  bulkUpdateStatusInputSchema,
  exportCsvOrdersInputSchema,
  getOrderByIdInputSchema,
  listOrdersInputSchema,
  updateOrderStatusInputSchema,
} from "./orders.schema";
import { 
  updateOrderStatus, 
  getOrderById, 
  mapOrderOutput, 
  ORDER_QUERY_INCLUDE 
} from "~/server/order/service";
import type { OrderStatus, Prisma } from "../../../../generated/prisma";

/** Plafond export CSV (CR 6-5) : évite timeout / OOM. */
const EXPORT_CSV_MAX_ROWS = 10_000;

type OrderWhereInput = Prisma.OrderWhereInput;

/** Construit le where pour list et exportCsv (évite duplication, CR 6-5). */
function buildOrdersWhere(
  tenantId: string,
  opts: { status?: string | readonly string[]; dateFrom?: string; dateTo?: string },
): OrderWhereInput {
  const where: OrderWhereInput = { tenantId };
  if (opts?.status) {
    where.status = Array.isArray(opts.status)
      ? { in: opts.status as OrderStatus[] }
      : (opts.status as OrderStatus);
  }
  if (opts?.dateFrom ?? opts?.dateTo) {
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

/** Masque le téléphone pour PII : ***1234 (4 derniers chiffres). */
function maskPhone(phone: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return "***" + digits.slice(-4);
}

/** Échappe une cellule CSV (virgule, guillemets, retours à la ligne). */
function escapeCsvCell(value: string | number | Date | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}



export const ordersRouter = createTRPCRouter({
  list: managerProcedure
    .input(listOrdersInputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
      const limit = input?.limit ?? 20;
      const where = buildOrdersWhere(tenantId, {
        status: input?.status,
        dateFrom: input?.dateFrom,
        dateTo: input?.dateTo,
      });
      const orders = await db.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        skip: input?.cursor ? 1 : 0,
        cursor: input?.cursor ? { id: input.cursor } : undefined,
        include: ORDER_QUERY_INCLUDE,
      });
      const items = orders.slice(0, limit).map(mapOrderOutput);
      const nextCursor = orders.length > limit ? orders[limit - 1]?.id : undefined;
      return { items, nextCursor };
    }),

  /** Story 6.5: Export CSV commandes. Réservé OWNER/MANAGER. */
  exportCsv: managerProcedure
    .input(exportCsvOrdersInputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
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
      const where = buildOrdersWhere(tenantId, {
        status: input?.status,
        dateFrom: input?.dateFrom,
        dateTo: input?.dateTo,
      });
      const orders = await db.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: EXPORT_CSV_MAX_ROWS + 1,
        include: {
          reservation: {
            select: {
              clientPhone: true,
              liveItem: { select: { code: true } },
              catalogueItem: { select: { code: true } },
            },
          },
        },
      });
      if (orders.length > EXPORT_CSV_MAX_ROWS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Trop de commandes (max ${EXPORT_CSV_MAX_ROWS}). Affinez les filtres (statut, période).`,
        });
      }
      const headers = ["orderNumber", "status", "depositStatus", "createdAt", "clientPhone", "liveItemCode"];
      const rows = orders.map((o) => [
        o.orderNumber,
        o.status,
        o.depositStatus ?? "",
        o.createdAt.toISOString(),
        maskPhone(o.reservation.clientPhone),
        o.reservation.catalogueItem?.code ?? o.reservation.liveItem?.code ?? "",
      ]);
      const csvLines = [
        headers.map(escapeCsvCell).join(","),
        ...rows.map((row) => row.map(escapeCsvCell).join(",")),
      ];
      const csv = "\uFEFF" + csvLines.join("\n"); // UTF-8 BOM for Excel
      const filename = `commandes-${new Date().toISOString().slice(0, 10)}.csv`;
      return { csv, filename };
    }),

  getById: managerProcedure
    .input(getOrderByIdInputSchema)
    .query(async ({ ctx, input }) => {
      const order = await getOrderById(ctx.session.user.tenantId, input.orderId);
      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Commande introuvable." });
      }
      return order;
    }),

  updateStatus: managerProcedure
    .input(updateOrderStatusInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await updateOrderStatus({
        tenantId: ctx.session.user.tenantId,
        orderId: input.orderId,
        newStatus: input.status as OrderStatus,
      });

      if (!result.ok) {
        throw new TRPCError({
          code: result.error?.includes("introuvable") ? "NOT_FOUND" : "BAD_REQUEST",
          message: result.error,
        });
      }

      return {
        id: input.orderId,
        orderNumber: result.orderNumber!,
        status: input.status,
      };
    }),

  /** Phase 4.2: Bulk marking de plusieurs commandes vers un même statut (ex: "delivered"). */
  bulkUpdateStatus: managerProcedure
    .input(bulkUpdateStatusInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;

      const results = await Promise.all(
        input.orderIds.map(async (orderId) => {
          return updateOrderStatus({
            tenantId,
            orderId,
            newStatus: input.status as OrderStatus,
            correlationIdPrefix: "bulk",
          });
        })
      );

      const updated = results.filter((r) => r.ok).length;
      const skipped = results.filter((r) => !r.ok).length;

      if (updated === 0 && skipped > 0) {
        throw new TRPCError({ 
          code: "NOT_FOUND", 
          message: skipped === 1 ? results[0]?.error : "Aucune commande mise à jour." 
        });
      }

      return { updated, skipped };
    }),
});
