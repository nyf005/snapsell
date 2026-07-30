/**
 * Conversations reprises en main.
 *
 * ── POURQUOI CE ROUTER EXISTE ───────────────────────────────────────────────
 * `setHandedOff` n'était appelé qu'avec `true` : une conversation basculée vers une
 * personne ne revenait jamais au robot. Le webhook applique désormais une
 * expiration de 24 h, mais rien ne permettait de rendre la main plus tôt, ni même
 * de savoir quelles conversations étaient concernées.
 *
 * Ces deux lectures sont opérationnelles, pas de la configuration : elles sont donc
 * en `protectedProcedure`, comme les commandes et les preuves. Reprendre une
 * conversation fait partie du travail d'un Agent.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { maskPhone } from "~/lib/validations/phone";
import { db } from "~/server/db";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { HANDOFF_TTL_MS } from "~/server/workers/webhook-processor";

export const conversationsRouter = createTRPCRouter({
  /**
   * Les conversations où une personne a pris le relais et où le robot se tait.
   *
   * Le numéro est masqué, comme sur l'écran du live : l'écran sert à décider de
   * rendre la main, pas à recopier un numéro.
   */
  listHandedOff: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;

    const rows = await db.conversationState.findMany({
      where: { tenantId, handedOff: true },
      orderBy: { updatedAt: "desc" },
      // Plafonné comme les autres listes du projet : un écran ne montre pas mille
      // lignes, et la liste sert à agir, pas à archiver.
      take: 50,
      select: { id: true, phone: true, updatedAt: true },
    });

    const now = Date.now();
    return rows.map((r) => ({
      id: r.id,
      phone: r.phone,
      phoneMasked: maskPhone(r.phone),
      since: r.updatedAt,
      /**
       * Le webhook rend la main tout seul passé ce délai. L'afficher évite de se
       * demander pourquoi une conversation a « repris » sans qu'on y touche.
       */
      expiresAt: new Date(r.updatedAt.getTime() + HANDOFF_TTL_MS),
      expired: now - r.updatedAt.getTime() >= HANDOFF_TTL_MS,
    }));
  }),

  /** Rend la conversation au robot, sans attendre l'expiration. */
  handBackToBot: protectedProcedure
    .input(z.object({ phone: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;

      // Filtré sur le tenant, et pas seulement sur le téléphone : deux boutiques
      // peuvent parler au même numéro.
      const existing = await db.conversationState.findUnique({
        where: { tenantId_phone: { tenantId, phone: input.phone } },
        select: { id: true, handedOff: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation introuvable." });
      }
      if (!existing.handedOff) {
        // Déjà rendue — probablement par l'expiration, ou par quelqu'un d'autre.
        return { ok: true, alreadyBack: true };
      }

      await db.conversationState.update({
        where: { id: existing.id },
        data: { handedOff: false },
      });
      return { ok: true, alreadyBack: false };
    }),
});
