/**
 * Story 7B.1 + 7B.2: Console ops multi-tenant pour diagnostic incidents.
 * 7B.1: eventLogs.list, tenants.list. 7B.2: dlq.list, dlq.failedMessages.
 * Accès réservé aux utilisateurs avec rôle OPS (tenantId null).
 */

import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { Prisma } from "../../../../generated/prisma";
import { createTRPCRouter, opsProcedure } from "~/server/api/trpc";
import { z } from "zod";
import { eventTypeEnumSchema } from "./eventLog.schema";
import { buildEventLogWhere } from "~/server/events/buildEventLogWhere";

const dateOptionalSchema = z
  .string()
  .optional()
  .refine((v) => !v || !Number.isNaN(Date.parse(v)), {
    message: "Date invalide",
  });

/** Schéma d'entrée pour ops.dlq.list (Story 7B.2 : file d'erreurs DLQ) */
const opsDlqListInputSchema = z.object({
  tenantId: z.string().cuid().min(1).optional(),
  jobType: z.string().min(1).optional(),
  resolved: z.boolean().optional(), // true = résolu uniquement, false = non résolu uniquement, undefined = tous
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().cuid().optional(),
});

/** Schéma d'entrée pour ops.eventLogs.list (CR 7B-1 M1 : tenantId optionnel si correlationId fourni) */
const opsEventLogsListInputSchema = z
  .object({
    tenantId: z.string().cuid().min(1).optional(), // Optionnel si correlationId fourni
    eventType: eventTypeEnumSchema.optional(),
    dateFrom: dateOptionalSchema,
    dateTo: dateOptionalSchema,
    correlationId: z.string().min(1).optional(),
    limit: z.number().min(1).max(100).default(50),
    cursor: z.string().cuid().optional(),
  })
  .refine(
    (v) => {
      // Au moins tenantId OU correlationId requis
      return !!(v.tenantId ?? v.correlationId);
    },
    {
      message:
        "Sélectionnez un tenant ou renseignez un correlationId.",
    },
  )
  .refine(
    (v) => {
      if (!v.dateFrom || !v.dateTo) return true;
      const from = Date.parse(v.dateFrom);
      const to = Date.parse(v.dateTo);
      return !Number.isNaN(from) && !Number.isNaN(to) && from <= to;
    },
    {
      message:
        "La date de début doit être antérieure ou égale à la date de fin.",
    },
  );

/**
 * Masque les données sensibles dans le payload (Story 7B.1 AC3).
 * Tronque/masque : numéros complets, adresses complètes, preuves brutes.
 */
function sanitizePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  if (Array.isArray(payload)) {
    return payload.map(sanitizePayload);
  }
  const sanitized: Record<string, unknown> = {};
  // Pattern E.164 : +<country><number> (ex: +33612345678)
  const phonePattern = /^\+\d{7,15}$/;

  for (const [key, value] of Object.entries(payload)) {
    const keyLower = key.toLowerCase();
    // Masquer numéros complets (phone, phoneNumber, et to/from uniquement si format E.164)
    if (
      keyLower.includes("phone") &&
      typeof value === "string" &&
      value.length > 4
    ) {
      sanitized[key] = `${value.slice(0, 2)}****${value.slice(-2)}`;
    } else if (
      (keyLower === "to" || keyLower === "from" || keyLower === "number") &&
      typeof value === "string" &&
      phonePattern.test(value)
    ) {
      sanitized[key] = `${value.slice(0, 2)}****${value.slice(-2)}`;
    }
    // Masquer adresses complètes
    else if (
      (keyLower.includes("address") || keyLower.includes("adresse")) &&
      typeof value === "string" &&
      value.length > 10
    ) {
      sanitized[key] = `${value.slice(0, 10)}...`;
    }
    // Tronquer body / contenu message (Story 7B.2 – payload DLQ)
    else if (
      (keyLower === "body" || keyLower === "textpayload") &&
      typeof value === "string" &&
      value.length > 200
    ) {
      sanitized[key] = `${value.slice(0, 200)}…`;
    }
    // Masquer preuves brutes (mediaStorageKey, textPayload court)
    else if (
      (keyLower.includes("proof") ||
        keyLower.includes("preuve") ||
        keyLower === "mediastoragekey") &&
      typeof value === "string" &&
      value.length > 20
    ) {
      sanitized[key] = "[MASQUÉ]";
    }
    // Récursif pour objets imbriqués
    else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizePayload(value);
    }
    // Conserver autres champs (erreur, type, statut, identifiants métier)
    else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/** Vérifie qu'un tenant existe. Lance NOT_FOUND sinon. */
async function assertTenantExists(tenantId: string) {
  const exists = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });
  if (!exists) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Tenant ${tenantId} introuvable`,
    });
  }
}

export const opsRouter = createTRPCRouter({
  /** Liste des tenants (pour filtre ops console). */
  tenants: createTRPCRouter({
    list: opsProcedure.query(async () => {
      const tenants = await db.tenant.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      return tenants;
    }),
  }),

  /** Liste paginée des événements (ops console). tenantId OU correlationId requis (CR 7B-1 M1). */
  eventLogs: createTRPCRouter({
    list: opsProcedure
      .input(opsEventLogsListInputSchema)
      .query(async ({ input }) => {
        const { tenantId, ...opts } = input;
        const limit = opts.limit ?? 50;

        // buildEventLogWhere gère tenantId optionnel + tous les filtres (dates, eventType, correlationId).
        // Console OPS interne : historique complet, volontairement NON borné par le plan
        // du tenant — le support doit pouvoir investiguer au-delà de 90 jours.
        const where = buildEventLogWhere(tenantId, opts, true);

        // Vérifier que le tenant existe si fourni
        if (tenantId) await assertTenantExists(tenantId);

        // Toujours inclure le tenant (type-safe, pas d'assertion unsafe)
        const rows = await db.eventLog.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit + 1,
          skip: opts.cursor ? 1 : 0,
          cursor: opts.cursor ? { id: opts.cursor } : undefined,
          include: { tenant: { select: { name: true } } },
        });

        const items = rows.slice(0, limit).map((row) => ({
          id: row.id,
          eventType: row.eventType,
          entityType: row.entityType,
          entityId: row.entityId,
          correlationId: row.correlationId,
          actorType: row.actorType,
          payload: sanitizePayload(row.payload), // Masquer données sensibles
          createdAt: row.createdAt,
          tenantId: row.tenantId,
          tenantName: row.tenant.name,
        }));

        const nextCursor =
          rows.length > limit ? rows[limit - 1]?.id ?? undefined : undefined;

        // tenantName global : uniquement si un seul tenant sélectionné
        const globalTenantName = tenantId ? (items[0]?.tenantName ?? null) : null;

        return { items, nextCursor, tenantName: globalTenantName };
      }),
  }),

  /** Liste paginée des jobs en file d'erreurs (DLQ) – Story 7B.2 */
  dlq: createTRPCRouter({
    list: opsProcedure
      .input(opsDlqListInputSchema)
      .query(async ({ input }) => {
        const { tenantId, jobType, resolved, limit, cursor } = input;

        const where: Prisma.DeadLetterJobWhereInput = {};
        if (tenantId) where.tenantId = tenantId;
        if (jobType) where.jobType = jobType;
        if (resolved === true) where.resolvedAt = { not: null };
        if (resolved === false) where.resolvedAt = null;

        if (tenantId) await assertTenantExists(tenantId);

        const rows = await db.deadLetterJob.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit + 1,
          skip: cursor ? 1 : 0,
          cursor: cursor ? { id: cursor } : undefined,
          include: { tenant: { select: { name: true } } },
        });

        const items = rows.slice(0, limit).map((row) => ({
          id: row.id,
          jobType: row.jobType,
          tenantId: row.tenantId,
          tenantName: row.tenant.name,
          errorMessage: row.errorMessage,
          // Tronquer errorStack à 10 lignes max (CR 7B-2 M4 – pas d'info interne excessive)
          errorStack: row.errorStack
            ? row.errorStack.split("\n").slice(0, 10).join("\n")
            : null,
          attempts: row.attempts,
          createdAt: row.createdAt,
          resolvedAt: row.resolvedAt,
          payload: sanitizePayload(row.payload),
        }));

        const nextCursor =
          rows.length > limit ? rows[limit - 1]?.id ?? undefined : undefined;

        return { items, nextCursor };
      }),

    /** Envois échoués (MessageOut status = failed) – Story 7B.2 optionnel */
    failedMessages: opsProcedure
      .input(
        z.object({
          tenantId: z.string().cuid().min(1).optional(),
          limit: z.number().min(1).max(100).default(50),
          cursor: z.string().cuid().optional(),
        }),
      )
      .query(async ({ input }) => {
        const { tenantId, limit, cursor } = input;

        const where: Prisma.MessageOutWhereInput = {
          status: "failed",
        };
        if (tenantId) where.tenantId = tenantId;

        if (tenantId) await assertTenantExists(tenantId);

        const rows = await db.messageOut.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          take: limit + 1,
          skip: cursor ? 1 : 0,
          cursor: cursor ? { id: cursor } : undefined,
          include: { tenant: { select: { name: true } } },
        });

        const items = rows.slice(0, limit).map((row) => ({
          id: row.id,
          tenantId: row.tenantId,
          tenantName: row.tenant.name,
          to: row.to.startsWith("+") && /^\+\d{7,15}$/.test(row.to)
            ? `${row.to.slice(0, 2)}****${row.to.slice(-2)}`
            : row.to,
          body: row.body ? (row.body.length > 200 ? `${row.body.slice(0, 200)}…` : row.body) : "(indicateur typing)",
          lastError: row.lastError,
          attempts: row.attempts,
          correlationId: row.correlationId,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));

        const nextCursor =
          rows.length > limit ? rows[limit - 1]?.id ?? undefined : undefined;

        return { items, nextCursor };
      }),
  }),
});
