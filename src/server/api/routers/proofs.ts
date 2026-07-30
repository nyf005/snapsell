/**
 * Story 5.3: Valider ou refuser une preuve d'acompte.
 * Isolation tenant: tenantId depuis ctx.session.user.tenantId.
 */

import { TRPCError } from "@trpc/server";

import type { Prisma } from "../../../../generated/prisma";
import { appError } from "~/server/api/errors";
import { db } from "~/server/db";
import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import {
  approveProofInputSchema,
  rejectProofInputSchema,
  bulkApproveProofsInputSchema,
  bulkRejectProofsInputSchema,
  listPendingProofsInputSchema,
} from "./proofs.schema";
import { workerLogger } from "~/lib/logger";
import { logDepositApproved, logDepositRejected } from "~/server/events/eventLog";
import { writeToOutbox } from "~/server/messaging/outbox";
import { botMsg } from "~/server/messaging/templates";

const ORDER_CANCELLED_MEANWHILE =
  "Cette commande vient d'être annulée : le délai d'acompte était dépassé et la cliente a déjà reçu le message d'annulation. Contactez-la avant de refaire une commande.";

/**
 * Marque la preuve approuvée et la commande confirmée — **sous condition**.
 *
 * La condition vit dans l'écriture, pas avant elle. Les appelants vérifiaient
 * bien que la commande était en attente d'acompte, mais *hors* transaction :
 * `runDepositExpiryJob` pouvait l'annuler dans l'intervalle. L'`update`
 * inconditionnel qui suivait écrasait alors l'annulation — la commande
 * redevenait `confirmed` en base alors que la cliente venait de recevoir « votre
 * commande est annulée ». Le tableau de bord paraissait sain, la cliente non.
 * Constaté par `deposit-expiry.integration.test.ts`.
 *
 * La commande est écrite en premier : si elle n'est plus éligible, la preuve
 * reste `pending` et la vendeuse la retrouve dans sa liste à traiter, au lieu
 * d'une preuve « approuvée » rattachée à une commande annulée.
 *
 * Rend `false` quand la commande n'était plus en attente d'acompte — l'appelant
 * doit le dire, pas faire comme si de rien n'était.
 */
async function approveProofAndConfirmOrder(
  proofId: string,
  orderId: string,
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: orderId, status: "confirmed_pending_deposit" },
      data: { depositStatus: "deposit_approved", status: "confirmed" },
    });
    if (updated.count === 0) return false;

    await tx.paymentProof.update({
      where: { id: proofId },
      data: { status: "approved", reviewedAt: new Date() },
    });
    return true;
  });
}

export const proofsRouter = createTRPCRouter({
  listPending: protectedProcedure
    .input(listPendingProofsInputSchema)
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) {
        throw appError("UNAUTHORIZED", "session.expired");
      }
      const limit = input.limit ?? 20;

      /**
       * La file d'attente portait deux conditions : `status: "pending"` et
       * `order.depositStatus: "deposit_pending"`. La seconde n'a de sens que pour
       * la file — une preuve traitée a fait bouger le `depositStatus` de sa
       * commande, et la conjonction rendait alors la preuve introuvable.
       *
       * Hors file, on filtre donc sur le statut de la preuve seule.
       */
      const where: Prisma.PaymentProofWhereInput =
        input.status === "pending"
          ? { tenantId, status: "pending", order: { depositStatus: "deposit_pending" } }
          : input.status === "all"
            ? { tenantId }
            : { tenantId, status: input.status };

      const proofs = await db.paymentProof.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        skip: input.cursor ? 1 : 0,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              depositStatus: true,
              reservation: {
                select: { clientPhone: true },
              },
            },
          },
        },
      });
      const items = proofs.slice(0, limit).map((p) => ({
        id: p.id,
        orderId: p.order.id,
        orderNumber: p.order.orderNumber,
        clientPhone: p.order.reservation.clientPhone,
        status: p.status,
        // `kind` remplace `mediaStorageKey`, qui sortait tel quel. C'est un chemin
        // de stockage interne, et l'image se lit de toute façon par
        // `/api/proofs/[proofId]/media`. Même règle que `mapOrderOutput`.
        kind: p.mediaStorageKey ? ("image" as const) : p.textPayload ? ("text" as const) : ("empty" as const),
        textPayload: p.textPayload,
        correlationId: p.correlationId,
        createdAt: p.createdAt,
        reviewedAt: p.reviewedAt,
      }));
      const nextCursor = proofs.length > limit ? proofs[limit - 1]?.id : undefined;
      return { items, nextCursor };
    }),

  pendingCount: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;
    if (!tenantId) {
      throw appError("UNAUTHORIZED", "session.expired");
    }
    return db.paymentProof.count({
      where: {
        tenantId,
        status: "pending",
        order: { depositStatus: "deposit_pending" },
      },
    });
  }),

  approve: protectedProcedure
    .input(approveProofInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) {
        throw appError("UNAUTHORIZED", "session.expired");
      }
      const proof = await db.paymentProof.findFirst({
        where: { id: input.proofId, tenantId },
        include: {
          order: {
            include: { reservation: { select: { clientPhone: true } } },
          },
        },
      });
      if (!proof) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Preuve introuvable." });
      }
      if (proof.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cette preuve a déjà été traitée.",
        });
      }
      if (proof.order.status !== "confirmed_pending_deposit") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "La commande n'est pas en attente d'acompte.",
        });
      }

      const correlationId = `proof-${proof.id}-approve-${Date.now()}`;
      if (!(await approveProofAndConfirmOrder(input.proofId, proof.orderId))) {
        throw new TRPCError({ code: "CONFLICT", message: ORDER_CANCELLED_MEANWHILE });
      }

      await logDepositApproved(
        tenantId,
        proof.orderId,
        proof.id,
        proof.correlationId,
      ).catch((err) => {
        workerLogger.error("Event log deposit_approved failed", {
          proofId: proof.id,
          orderId: proof.orderId,
          correlationId: proof.correlationId,
          err,
        });
      });

      const clientPhone = proof.order.reservation.clientPhone;
      try {
        await writeToOutbox({
          tenantId,
          to: clientPhone,
          ...botMsg.client.proofApprovedInteractive(proof.order.orderNumber),
          correlationId,
        });
      } catch (err) {
        workerLogger.error("Outbox write failed after proof approval", {
          proofId: proof.id,
          orderId: proof.orderId,
          to: clientPhone,
          err,
        });
      }

      return {
        proofId: proof.id,
        orderId: proof.orderId,
        orderNumber: proof.order.orderNumber,
        status: "approved" as const,
      };
    }),

  reject: protectedProcedure
    .input(rejectProofInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) {
        throw appError("UNAUTHORIZED", "session.expired");
      }
      const proof = await db.paymentProof.findFirst({
        where: { id: input.proofId, tenantId },
        include: {
          order: {
            include: { reservation: { select: { clientPhone: true } } },
          },
        },
      });
      if (!proof) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Preuve introuvable." });
      }
      if (proof.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cette preuve a déjà été traitée.",
        });
      }

      const correlationId = `proof-${proof.id}-reject-${Date.now()}`;
      await db.$transaction(async (tx) => {
        await tx.paymentProof.update({
          where: { id: input.proofId },
          data: { status: "rejected", reviewedAt: new Date() },
        });
        await tx.order.update({
          where: { id: proof.orderId },
          data: { depositStatus: "deposit_rejected" },
        });
      });

      await logDepositRejected(
        tenantId,
        proof.orderId,
        proof.id,
        proof.correlationId,
      ).catch((err) => {
        workerLogger.error("Event log deposit_rejected failed", {
          proofId: proof.id,
          orderId: proof.orderId,
          correlationId: proof.correlationId,
          err,
        });
      });

      const clientPhone = proof.order.reservation.clientPhone;
      try {
        await writeToOutbox({
          tenantId,
          to: clientPhone,
          ...botMsg.client.proofRejectedInteractive(proof.order.orderNumber),
          correlationId,
        });
      } catch (err) {
        workerLogger.error("Outbox write failed after proof rejection", {
          proofId: proof.id,
          orderId: proof.orderId,
          to: clientPhone,
          err,
        });
      }

      return {
        proofId: proof.id,
        orderId: proof.orderId,
        orderNumber: proof.order.orderNumber,
        status: "rejected" as const,
      };
    }),

  bulkApprove: protectedProcedure
    .input(bulkApproveProofsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) {
        throw appError("UNAUTHORIZED", "session.expired");
      }
      const results: { proofId: string; ok: boolean; error?: string }[] = [];
      for (const proofId of input.proofIds) {
        try {
          const proof = await db.paymentProof.findFirst({
            where: { id: proofId, tenantId },
            include: {
              order: {
                include: { reservation: { select: { clientPhone: true } } },
              },
            },
          });
          if (!proof) {
            results.push({ proofId, ok: false, error: "Preuve introuvable." });
            continue;
          }
          if (proof.status !== "pending") {
            results.push({ proofId, ok: false, error: "Déjà traitée." });
            continue;
          }
          if (proof.order.status !== "confirmed_pending_deposit") {
            results.push({ proofId, ok: false, error: "Commande non en attente d'acompte." });
            continue;
          }
          const correlationId = `proof-${proof.id}-approve-${Date.now()}`;
          if (!(await approveProofAndConfirmOrder(proofId, proof.orderId))) {
            results.push({ proofId, ok: false, error: ORDER_CANCELLED_MEANWHILE });
            continue;
          }
          await logDepositApproved(
            tenantId,
            proof.orderId,
            proof.id,
            proof.correlationId,
          ).catch((err) => {
            workerLogger.error("Event log deposit_approved failed", {
              proofId: proof.id,
              orderId: proof.orderId,
              correlationId: proof.correlationId,
              err,
            });
          });
          const clientPhone = proof.order.reservation.clientPhone;
          try {
            await writeToOutbox({
              tenantId,
              to: clientPhone,
              ...botMsg.client.proofApprovedInteractive(proof.order.orderNumber),
              correlationId,
            });
          } catch (err) {
            workerLogger.error("Outbox write failed after proof approval", {
              proofId: proof.id,
              orderId: proof.orderId,
              to: clientPhone,
              err,
            });
          }
          results.push({ proofId, ok: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Erreur inconnue";
          results.push({ proofId, ok: false, error: msg });
        }
      }
      return { results };
    }),

  bulkReject: protectedProcedure
    .input(bulkRejectProofsInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.session.user.tenantId;
      if (!tenantId) {
        throw appError("UNAUTHORIZED", "session.expired");
      }
      const results: { proofId: string; ok: boolean; error?: string }[] = [];
      for (const proofId of input.proofIds) {
        try {
          const proof = await db.paymentProof.findFirst({
            where: { id: proofId, tenantId },
            include: {
              order: {
                include: { reservation: { select: { clientPhone: true } } },
              },
            },
          });
          if (!proof) {
            results.push({ proofId, ok: false, error: "Preuve introuvable." });
            continue;
          }
          if (proof.status !== "pending") {
            results.push({ proofId, ok: false, error: "Déjà traitée." });
            continue;
          }
          const correlationId = `proof-${proof.id}-reject-${Date.now()}`;
          await db.$transaction(async (tx) => {
            await tx.paymentProof.update({
              where: { id: proofId },
              data: { status: "rejected", reviewedAt: new Date() },
            });
            await tx.order.update({
              where: { id: proof.orderId },
              data: { depositStatus: "deposit_rejected" },
            });
          });
          await logDepositRejected(
            tenantId,
            proof.orderId,
            proof.id,
            proof.correlationId,
          ).catch((err) => {
            workerLogger.error("Event log deposit_rejected failed", {
              proofId: proof.id,
              orderId: proof.orderId,
              correlationId: proof.correlationId,
              err,
            });
          });
          const clientPhone = proof.order.reservation.clientPhone;
          try {
            await writeToOutbox({
              tenantId,
              to: clientPhone,
              ...botMsg.client.proofRejectedInteractive(proof.order.orderNumber),
              correlationId,
            });
          } catch (err) {
            workerLogger.error("Outbox write failed after proof rejection", {
              proofId: proof.id,
              orderId: proof.orderId,
              to: clientPhone,
              err,
            });
          }
          results.push({ proofId, ok: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Erreur inconnue";
          results.push({ proofId, ok: false, error: msg });
        }
      }
      return { results };
    }),
});
