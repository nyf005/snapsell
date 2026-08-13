/**
 * État de mise en route de la boutique.
 *
 * Entièrement **dérivé** des données existantes — aucune colonne de suivi, aucune
 * migration. La checklist disparaît d'elle-même quand tout est fait ; il n'y a
 * volontairement pas de bouton « masquer », qui permettrait de cacher définitivement
 * la seule chose séparant la vendeuse d'un produit fonctionnel.
 *
 * `protectedProcedure` et non `managerProcedure` : un AGENT doit pouvoir comprendre
 * pourquoi rien n'arrive, même s'il ne peut pas corriger lui-même.
 */

import { db } from "~/server/db";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  onboardingStatusOutputSchema,
  type SetupStepId,
} from "./onboarding.schema";

export const onboardingRouter = createTRPCRouter({
  getStatus: protectedProcedure
    .output(onboardingStatusOutputSchema)
    .query(async ({ ctx }) => {
      const tenantId = ctx.session.user.tenantId;

      const [tenant, categoryCount, zoneCount, communeCount, sellerPhoneCount, orderCount] =
        await Promise.all([
          db.tenant.findUnique({
            where: { id: tenantId },
            select: {
              metaPhoneNumberId: true,
              metaWabaId: true,
              metaAccessToken: true,
              assistantEnabled: true,
              faqDelivery: true,
              faqPayment: true,
              faqLocation: true,
              faqAvailability: true,
            },
          }),
          db.categoryPrice.count({ where: { tenantId } }),
          db.deliveryZone.count({ where: { tenantId } }),
          db.deliveryFeeCommune.count({ where: { tenantId } }),
          db.sellerPhone.count({ where: { tenantId } }),
          db.order.count({ where: { tenantId } }),
        ]);

      // Les trois identifiants sont requis : sans WABA ID, l'envoi échoue même si
      // le numéro et le token sont présents.
      const whatsappConnected = Boolean(
        tenant?.metaPhoneNumberId && tenant?.metaWabaId && tenant?.metaAccessToken,
      );

      const hasAnyFaq = Boolean(
        tenant?.faqDelivery ??
          tenant?.faqPayment ??
          tenant?.faqLocation ??
          tenant?.faqAvailability,
      );

      const steps: { id: SetupStepId; done: boolean; required: boolean }[] = [
        { id: "whatsapp", done: whatsappConnected, required: true },
        { id: "prices", done: categoryCount > 0, required: true },
        { id: "delivery", done: zoneCount + communeCount > 0, required: true },
        { id: "assistant", done: tenant?.assistantEnabled ?? false, required: true },
        { id: "replies", done: hasAnyFaq, required: false },
        { id: "sellerPhone", done: sellerPhoneCount > 0, required: false },
        { id: "firstSale", done: orderCount > 0, required: false },
      ];

      const doneCount = steps.filter((s) => s.done).length;

      return {
        steps,
        doneCount,
        totalCount: steps.length,
        isComplete: doneCount === steps.length,
        whatsappConnected,
      };
    }),
});
