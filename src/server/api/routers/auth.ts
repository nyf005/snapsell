import { TRPCError } from "@trpc/server";
import { compare, hash } from "bcrypt";

import { checkSignupRateLimit, getClientIpFromHeaders } from "~/lib/rate-limit";
import { db } from "~/server/db";
import {
  authedProcedure,
  createTRPCRouter,
  publicProcedure,
} from "~/server/api/trpc";
import { Role } from "../../../../generated/prisma";
import { changePasswordInputSchema, signupInputSchema } from "./auth.schema";

export const authRouter = createTRPCRouter({
  signup: publicProcedure
    .input(signupInputSchema)
    .mutation(async ({ ctx, input }) => {
      /**
       * `publicProcedure` ne porte pas le limiteur tRPC — et ne le pourrait pas :
       * celui-ci se clé sur un `userId` qui, ici, n'existe pas encore. Sans ce
       * frein, l'inscription créait des boutiques sans plafond et payait un
       * `hash(password, 10)` à chaque appel, offrant le coût CPU à l'inconnu.
       *
       * Le contrôle vient avant tout accès à la base, pour la même raison.
       */
      if (!(await checkSignupRateLimit(getClientIpFromHeaders(ctx.headers)))) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message:
            "Trop de créations de compte depuis cet appareil. Réessaie dans quelques minutes.",
        });
      }

      const existing = await db.user.findUnique({
        where: { email: input.email },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Un compte existe déjà avec cet email.",
        });
      }

      const passwordHash = await hash(input.password, 10);

      const result = await db.$transaction(async (tx) => {
        const now = new Date();
        const firstResetDate = new Date(now);
        firstResetDate.setMonth(firstResetDate.getMonth() + 1);

        const tenant = await tx.tenant.create({
          data: {
            name: input.tenantName,
            // Amorçage minimal : ces trois champs ne pilotent que le message
            // d'absence, et `awayMessage` reste null — rien n'est donc envoyé.
            // On n'amorce volontairement NI grille de prix, NI zones de livraison,
            // NI réponses FAQ : ces valeurs partent telles quelles aux clientes sur
            // WhatsApp, et un défaut non choisi par la vendeuse est irrattrapable.
            businessTimezone: "Africa/Abidjan",
            businessHoursStart: "08:00",
            businessHoursEnd: "20:00",
            // Amorçage du cycle de facturation : sans ces deux dates, le cron
            // `credits-monthly-reset` ne voit jamais le tenant et ses crédits
            // ne se rechargent jamais.
            cycleStartedAt: now,
            usageResetDate: firstResetDate,
          },
        });
        const newUser = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: input.email,
            name: input.name ?? null,
            passwordHash,
            role: Role.OWNER,
          },
        });
        return { tenant, user: newUser };
      });

      return {
        userId: result.user.id,
        tenantId: result.tenant.id,
        email: result.user.email,
      };
    }),

  /**
   * ── CHANGER SON MOT DE PASSE ────────────────────────────────────────────────
   *
   * Il n'existait aucun moyen de le faire. Le mécanisme de révocation de session
   * (`tokenVersion`, cf. `auth.ts`) citait pourtant le changement de mot de passe
   * comme sa raison d'être — mais rien ne l'incrémentait hors des mouvements
   * d'équipe. Un mot de passe divulgué ne pouvait donc pas être remplacé.
   *
   * `authedProcedure` et non `protectedProcedure` : son compte appartient à la
   * personne, pas à sa boutique. Un utilisateur OPS, ou quelqu'un qui vient
   * d'être retiré d'une équipe, doit pouvoir en changer.
   *
   * Le mot de passe actuel est revérifié ici même si la session est valide. Sans
   * cela, un poste laissé ouvert quelques minutes suffirait à s'approprier
   * définitivement le compte.
   * ────────────────────────────────────────────────────────────────────────────
   */
  changePassword: authedProcedure
    .input(changePasswordInputSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const user = await db.user.findUnique({
        where: { id: userId },
        select: { id: true, passwordHash: true },
      });

      if (!user?.passwordHash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Ce compte n'utilise pas de mot de passe.",
        });
      }

      if (!(await compare(input.currentPassword, user.passwordHash))) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Mot de passe actuel incorrect.",
        });
      }

      /**
       * L'incrément de `tokenVersion` est le cœur de l'opération, pas un détail :
       * il invalide les sessions ouvertes ailleurs — c'est-à-dire, précisément,
       * celles qu'on cherche à couper en changeant un mot de passe compromis.
       * La session courante tombe avec les autres ; l'écran appelant enchaîne
       * donc sur une déconnexion explicite plutôt que de laisser la personne
       * découvrir la coupure au bout d'une heure.
       */
      await db.user.update({
        where: { id: userId },
        data: {
          passwordHash: await hash(input.newPassword, 10),
          tokenVersion: { increment: 1 },
        },
      });

      return { ok: true };
    }),
});
