import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { canManageGrid } from "~/lib/rbac";
import { db } from "~/server/db";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

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
    .input(z.object({ userId: z.string(), role: z.enum(["MANAGER", "AGENT"]) }))
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
        data: { role: input.role },
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
        data: { tenantId: null },
      });
      return { ok: true };
    }),
});
