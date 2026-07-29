/**
 * Story 6.6: Résumé tableau de bord — agrégation des counts (preuves, commandes, session live).
 * Isolation tenant: tenantId depuis ctx.session.user.tenantId.
 */

import { db } from "~/server/db";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { canManageGrid } from "~/lib/rbac";
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
  /**
   * `protectedProcedure` et non `managerProcedure` : les AGENT ont
   * `/dashboard` pour page d'accueil, et un `managerProcedure` leur renvoyait
   * FORBIDDEN — le composant tombait alors sur `if (!summary) return null` et
   * affichait une salutation au-dessus du vide.
   *
   * Les chiffres d'affaires restent réservés aux managers ; ils sont mis à zéro
   * côté serveur pour les autres rôles (voir `canSeeRevenue` plus bas).
   */
  getSummary: protectedProcedure
    .output(dashboardSummaryOutputSchema)
    .query(async ({ ctx }) => {
      const tenantId = ctx.session.user.tenantId;
      const canSeeRevenue = canManageGrid(ctx.session.user.role as string);

      const now = new Date();
      const today = getTodayUtcRange(now);
      const yesterday = getYesterdayUtcRange(now);
      const last7Days = getLast7DaysRanges(now);

      const orderSelectForRevenue = {
        reservation: {
          select: {
            quantity: true,
            liveItem: { select: { amount: true } },
            catalogueItem: { select: { amount: true } },
          },
        },
      } as const;

      /** Montant d'une commande = prix unitaire × quantité réservée. */
      const orderRevenue = (o: {
        reservation: {
          quantity: number;
          liveItem: { amount: number | null } | null;
          catalogueItem: { amount: number | null } | null;
        };
      }) =>
        (o.reservation.catalogueItem?.amount ?? o.reservation.liveItem?.amount ?? 0) *
        o.reservation.quantity;

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
                quantity: true,
                liveItem: { select: { amount: true } },
                catalogueItem: { select: { amount: true } },
              },
            },
          },
        }),
      ]);

      const revenueTodayCents = ordersToday.reduce(
        (sum, o) => sum + orderRevenue(o),
        0
      );
      const revenueYesterdayCents = ordersYesterday.reduce(
        (sum, o) => sum + orderRevenue(o),
        0
      );

      // Agréger les commandes des 7 derniers jours par jour
      const revenueByDay = last7Days.map((day) => {
        const dayOrders = ordersLast7Days.filter((o) => {
          const t = o.createdAt.getTime();
          return t >= day.from.getTime() && t <= day.to.getTime();
        });
        const revenueCents = dayOrders.reduce(
          (sum, o) => sum + orderRevenue(o),
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
        // Le chiffre d'affaires n'est pas exposé aux rôles opérationnels.
        revenueTodayCents: canSeeRevenue ? revenueTodayCents : 0,
        revenueYesterdayCents: canSeeRevenue ? revenueYesterdayCents : 0,
        revenueByDay: canSeeRevenue
          ? revenueByDay
          : revenueByDay.map((d) => ({ ...d, revenueCents: 0 })),
        hasLiveSession: liveSession != null,
      };
    }),
});
