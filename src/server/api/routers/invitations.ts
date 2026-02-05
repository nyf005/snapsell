import { TRPCError } from "@trpc/server";
import crypto from "node:crypto";
import { hash } from "bcrypt";

import { canManageGrid } from "~/lib/rbac";
import { checkRateLimit } from "~/lib/rate-limit";
import { db } from "~/server/db";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import {
  acceptInvitationInputSchema,
  createInvitationInputSchema,
  getInvitationByTokenInputSchema,
} from "~/server/api/routers/invitations.schema";

const INVITATION_EXPIRY_DAYS = Number.parseInt(process.env.INVITATION_EXPIRY_DAYS ?? "7", 10);

/**
 * Hash un token d'invitation avec SHA-256 (déterministe pour permettre recherche par index)
 * Utilise SHA-256 au lieu de bcrypt car :
 * - Déterministe : même token → même hash (peut être indexé)
 * - Rapide : recherche directe par index
 * - Sécurisé : tokens non exposés en DB
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Logging helper pour les actions critiques d'invitation
 */
function logInvitationAction(
  action: "create" | "accept" | "list" | "get",
  data: { tenantId?: string; email?: string; invitationId?: string; error?: string },
) {
  // En production, utiliser un système de logging structuré (ex: Winston, Pino)
  if (process.env.NODE_ENV !== "production") {
    console.log(`[Invitation ${action.toUpperCase()}]`, {
      timestamp: new Date().toISOString(),
      ...data,
    });
  }
  // TODO: Intégrer avec système de logging en production
}

/**
 * Valide une invitation (non consommée, non expirée)
 * Helper pour éviter la duplication de code
 */
function validateInvitation(inv: { consumedAt: Date | null; expiresAt: Date } | null) {
  if (!inv) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Invitation introuvable ou expirée.",
    });
  }
  if (inv.consumedAt) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Cette invitation a déjà été utilisée.",
    });
  }
  if (inv.expiresAt < new Date()) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Cette invitation a expiré.",
    });
  }
}

export const invitationsRouter = createTRPCRouter({
  createInvitation: protectedProcedure
    .input(createInvitationInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!canManageGrid(ctx.session.user.role as string)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Seuls Owner et Manager peuvent créer une invitation.",
        });
      }
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant non identifié.",
        });
      }

      // Rate limiting : max 10 invitations par heure par tenant
      if (!checkRateLimit(`invitation:${tenantId}`)) {
        logInvitationAction("create", {
          tenantId,
          email: input.email,
          error: "Rate limit exceeded",
        });
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Trop de demandes. Veuillez réessayer dans une heure.",
        });
      }

      // Utiliser une transaction pour éviter les race conditions
      const invitation = await db.$transaction(async (tx) => {
        const existing = await tx.invitation.findFirst({
          where: {
            tenantId,
            email: input.email,
            consumedAt: null,
          },
        });
        if (existing) {
          logInvitationAction("create", {
            tenantId,
            email: input.email,
            error: "Invitation déjà en attente",
          });
          throw new TRPCError({
            code: "CONFLICT",
            message: "Une invitation est déjà en attente pour cet email.",
          });
        }

        const token = crypto.randomBytes(32).toString("hex");
        const tokenHash = hashToken(token);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

        const newInvitation = await tx.invitation.create({
          data: {
            tenantId,
            email: input.email,
            role: "AGENT",
            token, // Gardé temporairement pour compatibilité migration
            tokenHash, // Hash SHA-256 du token
            expiresAt,
          },
        });

        logInvitationAction("create", {
          tenantId,
          email: input.email,
          invitationId: newInvitation.id,
        });

        // Retourner invitation avec token original pour l'URL
        return { ...newInvitation, token };
      });

      // Retourner le token original (non hashé) pour l'URL d'acceptation
      // Le tokenHash est stocké en DB, mais le token original est nécessaire pour l'URL
      return {
        id: invitation.id,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
        acceptLink: `/invite/accept?token=${invitation.token}`, // Token original pour l'URL
      };
    }),

  listInvitations: protectedProcedure.query(async ({ ctx }) => {
    if (!canManageGrid(ctx.session.user.role as string)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Seuls Owner et Manager peuvent lister les invitations.",
      });
    }
    const tenantId = ctx.session.user.tenantId;
    if (!tenantId) return [];

    const rows = await db.invitation.findMany({
      where: { tenantId, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    }));
  }),

  getInvitationByToken: publicProcedure
    .input(getInvitationByTokenInputSchema)
    .query(async ({ input }) => {
      const tokenHash = hashToken(input.token);
      // Rechercher d'abord par tokenHash (nouveau), puis par token (ancien pour compatibilité)
      const inv = await db.invitation.findFirst({
        where: {
          OR: [
            { tokenHash },
            { token: input.token }, // Fallback pour invitations créées avant migration
          ],
        },
        include: { tenant: { select: { name: true } } },
      });
      validateInvitation(inv);
      return {
        email: inv!.email,
        role: inv!.role,
        tenantName: inv!.tenant.name,
        tenantId: inv!.tenantId,
      };
    }),

  acceptInvitation: publicProcedure
    .input(acceptInvitationInputSchema)
    .mutation(async ({ input }) => {
      const tokenHash = hashToken(input.token);
      // Rechercher d'abord par tokenHash (nouveau), puis par token (ancien pour compatibilité)
      const inv = await db.invitation.findFirst({
        where: {
          OR: [
            { tokenHash },
            { token: input.token }, // Fallback pour invitations créées avant migration
          ],
        },
      });
      validateInvitation(inv);

      const existingUser = await db.user.findUnique({
        where: { email: inv!.email },
      });

      if (existingUser) {
        if (existingUser.tenantId === inv!.tenantId) {
          // Utilisateur déjà membre du tenant → refuser l'invitation avec message clair
          await db.invitation.update({
            where: { id: inv!.id },
            data: { consumedAt: new Date() },
          });
          logInvitationAction("accept", {
            tenantId: inv!.tenantId,
            email: inv!.email,
            invitationId: inv!.id,
            error: "Utilisateur déjà membre du tenant",
          });
          throw new TRPCError({
            code: "CONFLICT",
            message: "Vous êtes déjà membre de cette équipe. Connectez-vous pour accéder au dashboard.",
          });
        }
        // Utilisateur existe dans un autre tenant → refus explicite
        logInvitationAction("accept", {
          tenantId: inv!.tenantId,
          email: inv!.email,
          invitationId: inv!.id,
          error: "Utilisateur existe dans autre tenant",
        });
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Un compte existe déjà avec cet email pour un autre tenant. Connectez-vous avec ce compte pour accepter l'invitation.",
        });
      }

      // Validation déjà faite par Zod, mais gardons cette vérification pour sécurité
      if (!input.name.trim() || !input.password) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Nom et mot de passe requis pour créer le compte.",
        });
      }

      const passwordHash = await hash(input.password, 10);
      const user = await db.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            tenantId: inv!.tenantId,
            email: inv!.email,
            name: input.name.trim(),
            passwordHash,
            role: inv!.role,
          },
        });
        await tx.invitation.update({
          where: { id: inv!.id },
          data: { consumedAt: new Date() },
        });
        return newUser;
      });

      logInvitationAction("accept", {
        tenantId: inv!.tenantId,
        email: inv!.email,
        invitationId: inv!.id,
      });

      return { 
        created: true, 
        alreadyMember: false, 
        userId: user.id,
        message: "Compte créé avec succès. Vous allez être connecté automatiquement.",
      };
    }),
});
