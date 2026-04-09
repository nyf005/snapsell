/**
 * Story 5.2: Gestion des statuts de commande (list, getById, updateStatus).
 * Story 5.4: Notification cliente par WhatsApp sur delivered/cancelled.
 * Story 6.5: Export CSV commandes (manager/owner), même filtres que list.
 * Isolation tenant: tenantId toujours depuis ctx.session.user.tenantId.
 */

import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import {
  bulkUpdateStatusInputSchema,
  exportCsvOrdersInputSchema,
  getOrderByIdInputSchema,
  listOrdersInputSchema,
  updateOrderStatusInputSchema,
} from "./orders.schema";
import { logOrderStatusChanged } from "~/server/events/eventLog";
import { writeToOutbox } from "~/server/messaging/outbox";
import { botMsg } from "~/server/messaging/templates";
import { workerLogger } from "~/lib/logger";
import { canTransitionFrom } from "~/lib/order-status-transitions";
import type { OrderStatus, Prisma } from "../../../../generated/prisma";

/** Plafond export CSV (CR 6-5) : évite timeout / OOM. */
const EXPORT_CSV_MAX_ROWS = 10_000;

type OrderWhereInput = Prisma.OrderWhereInput;

/** Construit le where pour list et exportCsv (évite duplication, CR 6-5). */
function buildOrdersWhere(
  tenantId: string,
  opts: { status?: string; dateFrom?: string; dateTo?: string },
): OrderWhereInput {
  const where: OrderWhereInput = { tenantId };
  if (opts?.status) {
    where.status = opts.status as OrderStatus;
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
  list: protectedProcedure
    .input(listOrdersInputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
      }
      const where = buildOrdersWhere(tenantId, {
        status: input?.status,
        dateFrom: input?.dateFrom,
        dateTo: input?.dateTo,
      });
      const orders = await db.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          reservation: {
            select: {
              id: true,
              clientPhone: true,
              address: true,
              liveItemId: true,
              liveItem: { select: { code: true } },
              catalogueItemId: true,
              catalogueItem: { select: { code: true } },
            },
          },
        },
      });
      return orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        depositStatus: o.depositStatus,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        reservationId: o.reservationId,
        clientPhone: o.reservation.clientPhone,
        deliveryAddress: o.reservation.address ?? null,
        liveItemCode: o.reservation.catalogueItem?.code ?? o.reservation.liveItem?.code ?? null,
      }));
    }),

  /** Story 6.5: Export CSV commandes. Réservé OWNER/MANAGER. Mêmes filtres que list. */
  exportCsv: protectedProcedure
    .input(exportCsvOrdersInputSchema)
    .query(async ({ ctx, input }) => {
      const role = ctx.session.user.role as string | undefined;
      if (role !== "OWNER" && role !== "MANAGER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Seuls les managers ou propriétaires peuvent exporter les commandes en CSV.",
        });
      }
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
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

  getById: protectedProcedure
    .input(getOrderByIdInputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
      }
      const order = await db.order.findFirst({
        where: { id: input.orderId, tenantId },
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
      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Commande introuvable." });
      }
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        depositStatus: order.depositStatus,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        reservationId: order.reservationId,
        clientPhone: order.reservation.clientPhone,
        liveItemCode: order.reservation.catalogueItem?.code ?? order.reservation.liveItem?.code ?? null,
      };
    }),

  updateStatus: protectedProcedure
    .input(updateOrderStatusInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
      }
      const order = await db.order.findFirst({
        where: { id: input.orderId, tenantId },
        include: {
          reservation: { select: { clientPhone: true } },
        },
      });
      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Commande introuvable." });
      }
      const from = order.status as OrderStatus;
      const to = input.status as OrderStatus;
      if (!canTransitionFrom(from as Parameters<typeof canTransitionFrom>[0], to as Parameters<typeof canTransitionFrom>[1])) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Transition non autorisée: ${from} → ${to}. Transitions autorisées: confirmed/confirmed_pending_deposit → preparing → in_delivery → delivered ; cancelled depuis confirmed, confirmed_pending_deposit, preparing ou in_delivery.`,
        });
      }
      const correlationId = `order-${order.id}-${Date.now()}`;
      const updated = await db.$transaction(async (tx) => {
        const o = await tx.order.update({
          where: { id: input.orderId },
          data: { status: to },
        });
        await logOrderStatusChanged(tenantId, order.id, correlationId, {
          from,
          to,
        });
        return o;
      });

      if (to === "delivered" || to === "cancelled" || to === "in_delivery") {
        const clientPhone = order.reservation.clientPhone;
        const body =
          to === "delivered"
            ? botMsg.client.orderDelivered(updated.orderNumber)
            : to === "cancelled"
              ? botMsg.client.orderCancelled(updated.orderNumber)
              : botMsg.client.orderInDelivery(updated.orderNumber);
        try {
          await writeToOutbox({
            tenantId,
            to: clientPhone,
            body,
            correlationId,
          });
        } catch (err) {
          workerLogger.error("Outbox write failed after order status change", {
            orderId: updated.id,
            orderNumber: updated.orderNumber,
            to: clientPhone,
            newStatus: to,
            err,
          });
        }
      }

      return {
        id: updated.id,
        orderNumber: updated.orderNumber,
        status: updated.status,
        updatedAt: updated.updatedAt,
      };
    }),

  /** Phase 4.2: Bulk marking de plusieurs commandes vers un même statut (ex: "delivered"). */
  bulkUpdateStatus: protectedProcedure
    .input(bulkUpdateStatusInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
      }

      const orders = await db.order.findMany({
        where: { id: { in: input.orderIds }, tenantId },
        include: { reservation: { select: { clientPhone: true } } },
      });

      if (orders.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Aucune commande trouvée." });
      }

      const to = input.status as OrderStatus;
      const results: { orderId: string; ok: boolean; orderNumber?: string }[] = [];

      await db.$transaction(async (tx) => {
        for (const order of orders) {
          const from = order.status as OrderStatus;
          if (!canTransitionFrom(from as Parameters<typeof canTransitionFrom>[0], to as Parameters<typeof canTransitionFrom>[1])) {
            results.push({ orderId: order.id, ok: false });
            continue;
          }
          await tx.order.update({ where: { id: order.id }, data: { status: to } });
          results.push({ orderId: order.id, ok: true, orderNumber: order.orderNumber });
        }
      });

      // Notifications WhatsApp pour les commandes réussies
      if (to === "delivered" || to === "cancelled" || to === "in_delivery") {
        for (const r of results.filter((r) => r.ok && r.orderNumber)) {
          const order = orders.find((o) => o.id === r.orderId);
          if (!order) continue;
          const body =
            to === "delivered"
              ? botMsg.client.orderDelivered(r.orderNumber!)
              : to === "cancelled"
                ? botMsg.client.orderCancelled(r.orderNumber!)
                : botMsg.client.orderInDelivery(r.orderNumber!);
          await writeToOutbox({
            tenantId,
            to: order.reservation.clientPhone,
            body,
            correlationId: `bulk-${order.id}-${Date.now()}`,
          }).catch((err) => {
            workerLogger.error("Outbox write failed after bulk status change", { orderId: order.id, err });
          });
        }
      }

      return {
        updated: results.filter((r) => r.ok).length,
        skipped: results.filter((r) => !r.ok).length,
      };
    }),
});
