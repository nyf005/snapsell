/**
 * Story 5.3: Valider ou refuser une preuve d'acompte.
 * Isolation tenant: tenantId depuis ctx.session.user.tenantId.
 */

import { TRPCError } from "@trpc/server";
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
} from "./proofs.schema";
import { workerLogger } from "~/lib/logger";
import { logDepositApproved, logDepositRejected } from "~/server/events/eventLog";
import { writeToOutbox } from "~/server/messaging/outbox";
import { botMsg } from "~/server/messaging/templates";

export const proofsRouter = createTRPCRouter({
  listPending: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;
    if (!tenantId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
    }
    const proofs = await db.paymentProof.findMany({
      where: {
        tenantId,
        status: "pending",
        order: { depositStatus: "deposit_pending" },
      },
      orderBy: { createdAt: "desc" },
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
    return proofs.map((p) => ({
      id: p.id,
      orderId: p.order.id,
      orderNumber: p.order.orderNumber,
      clientPhone: p.order.reservation.clientPhone,
      status: p.status,
      mediaStorageKey: p.mediaStorageKey,
      textPayload: p.textPayload,
      correlationId: p.correlationId,
      createdAt: p.createdAt,
    }));
  }),

  pendingCount: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;
    if (!tenantId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
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
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
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
      await db.$transaction(async (tx) => {
        await tx.paymentProof.update({
          where: { id: input.proofId },
          data: { status: "approved", reviewedAt: new Date() },
        });
        await tx.order.update({
          where: { id: proof.orderId },
          data: {
            depositStatus: "deposit_approved",
            status: "confirmed",
          },
        });
      });

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
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
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
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
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
          await db.$transaction(async (tx) => {
            await tx.paymentProof.update({
              where: { id: proofId },
              data: { status: "approved", reviewedAt: new Date() },
            });
            await tx.order.update({
              where: { id: proof.orderId },
              data: {
                depositStatus: "deposit_approved",
                status: "confirmed",
              },
            });
          });
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
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant non identifié." });
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
