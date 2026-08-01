import { TRPCError } from "@trpc/server";
import crypto from "node:crypto";
import { hash } from "bcrypt";

import { canManageGrid } from "~/lib/rbac";
import { checkRateLimit } from "~/lib/rate-limit";
import { createLogger } from "~/lib/logger";
import { db } from "~/server/db";
import { checkAgentsQuota } from "~/server/subscription/usage";
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

const invitationLogger = createLogger("Invitation");

/**
 * Logging helper pour les actions critiques d'invitation
 */
function logInvitationAction(
  action: "create" | "accept" | "list" | "get",
  data: {
    tenantId?: string;
    email?: string;
    invitationId?: string;
    role?: string;
    error?: string;
  },
) {
  invitationLogger.info(`Invitation ${action}`, data);
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
      try {
        if (!(await checkRateLimit(`invitation:${tenantId}`))) {
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
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Rate limiting indisponible. Réessaie dans quelques instants.",
        });
      }

      // Limite de sièges selon l'abonnement (Story 7A.2). Un siège = une personne
      // invitée, quel que soit son rôle — le message parle donc de membres.
      const agentsQuota = await checkAgentsQuota(tenantId);
      if (!agentsQuota.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Limite de membres atteinte (${agentsQuota.currentCount}/${agentsQuota.maxAgents}). Passez à un plan supérieur pour agrandir votre équipe.`,
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
            role: input.role,
            tokenHash, // Hash SHA-256 du token
            expiresAt,
          },
        });

        logInvitationAction("create", {
          tenantId,
          email: input.email,
          invitationId: newInvitation.id,
          role: input.role,
        });

        // Retourner invitation avec token original pour l'URL
        return { invitation: newInvitation, rawToken: token };
      });

      // Retourner le token original (non hashé) pour l'URL d'acceptation
      // Le tokenHash est stocké en DB, mais le token original est nécessaire pour l'URL
      return {
        id: invitation.invitation.id,
        email: invitation.invitation.email,
        expiresAt: invitation.invitation.expiresAt,
        acceptLink: `/invite/accept?token=${invitation.rawToken}`, // Token original pour l'URL
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
      const inv = await db.invitation.findFirst({
        where: { tokenHash: hashToken(input.token) },
        include: { tenant: { select: { name: true } } },
      });
      validateInvitation(inv);

      /**
       * Un compte existe-t-il déjà pour cette adresse ?
       *
       * Pilote l'écran d'acceptation : sans compte, on demande un nom et un mot
       * de passe ; avec, il n'y a rien à créer et les demander serait mensonger.
       *
       * Ce n'est pas un oracle d'existence d'adresse : le seul moyen d'obtenir
       * la réponse est de détenir un jeton d'invitation valide, émis pour cette
       * adresse précise — que l'appelant connaît donc déjà.
       */
      const existingUser = await db.user.findUnique({
        where: { email: inv!.email },
        select: { id: true },
      });

      return {
        email: inv!.email,
        role: inv!.role,
        tenantName: inv!.tenant.name,
        tenantId: inv!.tenantId,
        hasExistingAccount: existingUser != null,
      };
    }),

  acceptInvitation: publicProcedure
    .input(acceptInvitationInputSchema)
    .mutation(async ({ input }) => {
      const inv = await db.invitation.findFirst({
        where: { tokenHash: hashToken(input.token) },
      });
      validateInvitation(inv);

      // Limite de sièges selon l'abonnement (Story 7A.2)
      const agentsQuota = await checkAgentsQuota(inv!.tenantId);
      if (!agentsQuota.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Limite de membres atteinte pour cette boutique. L'équipe ne peut plus accepter de nouveaux membres pour le moment.",
        });
      }

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

        /**
         * ── RETIRER PUIS RÉINTÉGRER QUELQU'UN DEVAIT REDEVENIR POSSIBLE ───────
         *
         * `team.removeMember` ne supprime pas le compte : il met `tenantId` à
         * `null` pour préserver l'historique. La personne se retrouve donc sans
         * boutique — et toute réinvitation tombait ici, sur le refus « un compte
         * existe déjà pour un autre tenant ». Ce n'était pourtant pas le cas :
         * elle n'appartenait à aucun. Retirer quelqu'un par erreur était sans
         * retour, et la seule issue passait par la base de données.
         *
         * Un compte orphelin est donc rattaché à la boutique qui l'invite.
         *
         * Son mot de passe n'est jamais touché — ni ici, ni ailleurs dans ce
         * chemin. C'est la garantie qui rend l'opération sûre : sans elle, qui
         * émet une invitation vers l'adresse d'un compte orphelin pourrait en
         * redéfinir le mot de passe et s'en emparer. La personne se reconnecte
         * avec ses identifiants habituels.
         *
         * `tokenVersion` est incrémenté pour la même raison qu'ailleurs : un
         * jeton émis avant le rattachement porte encore `tenantId: null`.
         * ────────────────────────────────────────────────────────────────────
         */
        if (existingUser.tenantId === null) {
          await db.$transaction(async (tx) => {
            await tx.user.update({
              where: { id: existingUser.id },
              data: {
                tenantId: inv!.tenantId,
                role: inv!.role,
                tokenVersion: { increment: 1 },
              },
            });
            await tx.invitation.update({
              where: { id: inv!.id },
              data: { consumedAt: new Date() },
            });
          });

          logInvitationAction("accept", {
            tenantId: inv!.tenantId,
            email: inv!.email,
            invitationId: inv!.id,
            role: inv!.role,
          });

          return {
            created: false,
            rejoined: true,
            alreadyMember: false,
            userId: existingUser.id,
            message:
              "Tu fais de nouveau partie de l'équipe. Connecte-toi avec ton mot de passe habituel.",
          };
        }

        // Utilisateur rattaché à un autre tenant → refus explicite
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

      // Le schéma rend `name` et `password` optionnels — ils ne servent qu'ici,
      // sur le chemin de création. C'est donc ce chemin qui les exige.
      const trimmedName = input.name?.trim();
      if (!trimmedName || !input.password) {
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
            name: trimmedName,
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
        rejoined: false,
        alreadyMember: false,
        userId: user.id,
        message: "Compte créé. La connexion se fait automatiquement.",
      };
    }),
});
