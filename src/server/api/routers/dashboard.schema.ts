import { z } from "zod";

/** Output du résumé tableau de bord (Story 6.6). */
export const dashboardSummaryOutputSchema = z.object({
  pendingProofsCount: z.number(),
  lastProofSubmittedAt: z.date().nullable(),
  ordersPreparingCount: z.number(),
  ordersInDeliveryCount: z.number(),
  ordersTodayCount: z.number(),
  ordersYesterdayCount: z.number(),
  ordersThisWeekCount: z.number(),
  /** Revenu aujourd'hui (somme amountCents des commandes du jour). */
  revenueTodayCents: z.number(),
  /** Revenu hier (pour tendance %). */
  revenueYesterdayCents: z.number(),
  /** Revenus des 7 derniers jours (du plus ancien au plus récent). */
  revenueByDay: z.array(
    z.object({
      date: z.string(),
      revenueCents: z.number(),
      orders: z.number(),
    })
  ),
  hasLiveSession: z.boolean(),
  liveSessionLastActivityAt: z.date().nullable(),
});

export type DashboardSummaryOutput = z.infer<typeof dashboardSummaryOutputSchema>;
