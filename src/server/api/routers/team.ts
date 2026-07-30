import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { ASSIGNABLE_ROLES, canManageGrid } from "~/lib/rbac";
import { db } from "~/server/db";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

/**
 * ── POURQUOI CHAQUE ÉCRITURE ICI INCRÉMENTE `tokenVersion` ───────────────────
 *
 * Les sessions sont des JWT de 7 jours (`auth.ts`), et le rôle n'est relu en base
 * que s'il est absent du jeton — donc jamais, pour un jeton déjà émis. Modifier
 * `users.role` ou `users.tenantId` n'avait de ce fait **aucun effet** avant
 * expiration : promouvoir quelqu'un semblait ne rien faire, rétrograder laissait
 * ses droits une semaine, et `removeMember` laissait la personne retirée avec un
 * accès complet à la boutique, `enforceTenant` faisant confiance au `tenantId`
 * du jeton sans le revérifier.
 *
 * `auth.ts` porte déjà le remède : une vérification horaire qui compare le
 * `tokenVersion` du jeton à celui de la base et invalide la session s'ils
 * diffèrent. Mais rien dans le code ne l'incrémentait — le mécanisme existait
 * sans producteur. C'est le rôle de ces deux `update`.
 *
 * Reste une fenêtre d'au plus une heure, la granularité de cette vérification.
 * C'est un compromis assumé côté `auth.ts` : la resserrer coûte une requête par
 * rafraîchissement de jeton, pour tout le monde.
 * ────────────────────────────────────────────────────────────────────────────
 */

export const teamRouter = createTRPCRouter({
  listMembers: protectedProcedure.query(async ({ ctx }) => {
    if (!canManageGrid(ctx.session.user.role as string)) {
      return [];
    }
    const tenantId = ctx.session.user.tenantId;
    if (!tenantId) return [];

    const users = await db.user.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name ?? user.email.split("@")[0] ?? "Utilisateur",
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));
  }),

  updateRole: protectedProcedure
    .input(z.object({ userId: z.string(), role: z.enum(ASSIGNABLE_ROLES) }))
    .mutation(async ({ ctx, input }) => {
      if (!canManageGrid(ctx.session.user.role as string)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Permission insuffisante." });
      }
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN" });

      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Vous ne pouvez pas modifier votre propre rôle.",
        });
      }

      const target = await db.user.findFirst({
        where: { id: input.userId, tenantId },
        select: { id: true, role: true },
      });
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Membre introuvable." });
      }
      if (target.role === "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Le rôle Admin ne peut pas être modifié.",
        });
      }

      await db.user.update({
        where: { id: input.userId },
        data: { role: input.role, tokenVersion: { increment: 1 } },
      });
      return { ok: true };
    }),

  removeMember: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!canManageGrid(ctx.session.user.role as string)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Permission insuffisante." });
      }
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN" });

      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Vous ne pouvez pas vous retirer vous-même.",
        });
      }

      const target = await db.user.findFirst({
        where: { id: input.userId, tenantId },
        select: { id: true, role: true },
      });
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Membre introuvable." });
      }
      if (target.role === "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "L'Admin du tenant ne peut pas être retiré.",
        });
      }

      // Retire l'accès au tenant sans supprimer le compte utilisateur
      await db.user.update({
        where: { id: input.userId },
        data: { tenantId: null, tokenVersion: { increment: 1 } },
      });
      return { ok: true };
    }),
});
