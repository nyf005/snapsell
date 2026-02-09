/**
 * Story 6.6: Résumé tableau de bord — agrégation des counts (preuves, commandes, session live).
 * Isolation tenant: tenantId depuis ctx.session.user.tenantId.
 */

import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { dashboardSummaryOutputSchema } from "./dashboard.schema";
import { getCurrentSessionReadOnly } from "~/server/live-session/service";

function getTodayUtcRange(): { from: Date; to: Date } {
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 1);
  to.setTime(to.getTime() - 1);
  return { from, to };
}

function getYesterdayUtcRange(): { from: Date; to: Date } {
  const today = getTodayUtcRange();
  const from = new Date(today.from);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(today.from);
  to.setTime(to.getTime() - 1);
  return { from, to };
}

/** Retourne les 7 derniers jours (du plus ancien au plus récent, aujourd'hui inclus). */
function getLast7DaysRanges(): { date: string; from: Date; to: Date }[] {
  const ranges: { date: string; from: Date; to: Date }[] = [];
  for (let i = 6; i >= 0; i--) {
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - i);
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setUTCHours(23, 59, 59, 999);
    const date = from.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
    ranges.push({ date, from, to });
  }
  return ranges;
}

function getThisWeekUtcRange(): { from: Date; to: Date } {
  const now = new Date();
  const day = now.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const from = new Date(now);
  from.setUTCDate(now.getUTCDate() + mondayOffset);
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setUTCDate(from.getUTCDate() + 6);
  to.setUTCHours(23, 59, 59, 999);
  return { from, to };
}

export const dashboardRouter = createTRPCRouter({
  getSummary: protectedProcedure
    .output(dashboardSummaryOutputSchema)
    .query(async ({ ctx }) => {
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
      }

      const today = getTodayUtcRange();
      const yesterday = getYesterdayUtcRange();
      const week = getThisWeekUtcRange();
      const last7Days = getLast7DaysRanges();

      const orderSelectForRevenue = {
        reservation: {
          select: {
            liveItem: { select: { amountCents: true } },
          },
        },
      } as const;

      const [
        pendingProofsCount,
        lastProof,
        ordersPreparingCount,
        ordersInDeliveryCount,
        ordersToday,
        ordersYesterday,
        ordersThisWeekCount,
        liveSession,
        ordersLast7Days,
      ] = await Promise.all([
        db.paymentProof.count({
          where: {
            tenantId,
            status: "pending",
            order: { depositStatus: "deposit_pending" },
          },
        }),
        db.paymentProof.findFirst({
          where: {
            tenantId,
            status: "pending",
            order: { depositStatus: "deposit_pending" },
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        db.order.count({
          where: { tenantId, status: "preparing" },
        }),
        db.order.count({
          where: { tenantId, status: "in_delivery" },
        }),
        db.order.findMany({
          where: {
            tenantId,
            createdAt: { gte: today.from, lte: today.to },
          },
          select: orderSelectForRevenue,
        }),
        db.order.findMany({
          where: {
            tenantId,
            createdAt: { gte: yesterday.from, lte: yesterday.to },
          },
          select: orderSelectForRevenue,
        }),
        db.order.count({
          where: {
            tenantId,
            createdAt: { gte: week.from, lte: week.to },
          },
        }),
        getCurrentSessionReadOnly(tenantId),
        // Une seule requête pour les 7 derniers jours
        db.order.findMany({
          where: {
            tenantId,
            createdAt: { gte: last7Days[0]!.from, lte: last7Days[6]!.to },
          },
          select: {
            createdAt: true,
            reservation: {
              select: { liveItem: { select: { amountCents: true } } },
            },
          },
        }),
      ]);

      const revenueTodayCents = ordersToday.reduce(
        (sum, o) => sum + (o.reservation.liveItem.amountCents ?? 0),
        0
      );
      const revenueYesterdayCents = ordersYesterday.reduce(
        (sum, o) => sum + (o.reservation.liveItem.amountCents ?? 0),
        0
      );

      // Agréger les commandes des 7 derniers jours par jour
      const revenueByDay = last7Days.map((day) => {
        const dayOrders = ordersLast7Days.filter((o) => {
          const t = o.createdAt.getTime();
          return t >= day.from.getTime() && t <= day.to.getTime();
        });
        const revenueCents = dayOrders.reduce(
          (sum, o) => sum + (o.reservation.liveItem.amountCents ?? 0),
          0
        );
        return { date: day.date, revenueCents, orders: dayOrders.length };
      });

      return {
        pendingProofsCount,
        lastProofSubmittedAt: lastProof?.createdAt ?? null,
        ordersPreparingCount,
        ordersInDeliveryCount,
        ordersTodayCount: ordersToday.length,
        ordersYesterdayCount: ordersYesterday.length,
        ordersThisWeekCount,
        revenueTodayCents,
        revenueYesterdayCents,
        revenueByDay,
        hasLiveSession: liveSession != null,
        liveSessionLastActivityAt: liveSession?.lastActivityAt ?? null,
      };
    }),
});
