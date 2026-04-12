/**
 * Story 6.6: Résumé tableau de bord — agrégation des counts (preuves, commandes, session live).
 * Isolation tenant: tenantId depuis ctx.session.user.tenantId.
 */

import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { createTRPCRouter, managerProcedure } from "~/server/api/trpc";
import { dashboardSummaryOutputSchema } from "./dashboard.schema";
import { getCurrentSessionReadOnly } from "~/server/live-session/service";

/** Début et fin UTC du jour courant. Accepte `now` pour la testabilité. */
export function getTodayUtcRange(now: Date = new Date()): { from: Date; to: Date } {
  const from = new Date(now);
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 1);
  to.setTime(to.getTime() - 1);
  return { from, to };
}

/** Début et fin UTC de la veille. Accepte `now` pour la testabilité. */
export function getYesterdayUtcRange(now: Date = new Date()): { from: Date; to: Date } {
  const today = getTodayUtcRange(now);
  const from = new Date(today.from);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(today.from);
  to.setTime(to.getTime() - 1);
  return { from, to };
}

/** Retourne les 7 derniers jours (du plus ancien au plus récent, aujourd'hui inclus). Accepte `now` pour la testabilité. */
export function getLast7DaysRanges(now: Date = new Date()): { date: string; from: Date; to: Date }[] {
  const ranges: { date: string; from: Date; to: Date }[] = [];
  for (let i = 6; i >= 0; i--) {
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - i);
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setUTCHours(23, 59, 59, 999);
    const date = from.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
    ranges.push({ date, from, to });
  }
  return ranges;
}

export const dashboardRouter = createTRPCRouter({
  getSummary: managerProcedure
    .output(dashboardSummaryOutputSchema)
    .query(async ({ ctx }) => {
      const tenantId = ctx.tenantId;

      const now = new Date();
      const today = getTodayUtcRange(now);
      const yesterday = getYesterdayUtcRange(now);
      const last7Days = getLast7DaysRanges(now);

      const orderSelectForRevenue = {
        reservation: {
          select: {
            liveItem: { select: { amount: true } },
            catalogueItem: { select: { amount: true } },
          },
        },
      } as const;

      const [
        pendingProofsCount,
        lastProof,
        ordersPreparingCount,
        ordersToday,
        ordersYesterday,
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
              select: {
                liveItem: { select: { amount: true } },
                catalogueItem: { select: { amount: true } },
              },
            },
          },
        }),
      ]);

      const revenueTodayCents = ordersToday.reduce(
        (sum, o) =>
          sum +
          (o.reservation.liveItem?.amount ??
            o.reservation.catalogueItem?.amount ??
            0),
        0
      );
      const revenueYesterdayCents = ordersYesterday.reduce(
        (sum, o) =>
          sum +
          (o.reservation.liveItem?.amount ??
            o.reservation.catalogueItem?.amount ??
            0),
        0
      );

      // Agréger les commandes des 7 derniers jours par jour
      const revenueByDay = last7Days.map((day) => {
        const dayOrders = ordersLast7Days.filter((o) => {
          const t = o.createdAt.getTime();
          return t >= day.from.getTime() && t <= day.to.getTime();
        });
        const revenueCents = dayOrders.reduce(
          (sum, o) =>
            sum +
            (o.reservation.liveItem?.amount ??
              o.reservation.catalogueItem?.amount ??
              0),
          0
        );
        return { date: day.date, revenueCents, orders: dayOrders.length };
      });

      return {
        pendingProofsCount,
        lastProofSubmittedAt: lastProof?.createdAt ?? null,
        ordersPreparingCount,
        ordersTodayCount: ordersToday.length,
        ordersYesterdayCount: ordersYesterday.length,
        revenueTodayCents,
        revenueYesterdayCents,
        revenueByDay,
        hasLiveSession: liveSession != null,
      };
    }),
});
