import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, managerProcedure, protectedProcedure } from "~/server/api/trpc";
import { getAssistantStatus, setAssistantEnabled } from "~/server/assistant/service";

export const assistantRouter = createTRPCRouter({
  getStatus: protectedProcedure.query(({ ctx }) =>
    getAssistantStatus(ctx.session.user.tenantId),
  ),

  setEnabled: managerProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await setAssistantEnabled({
          tenantId: ctx.session.user.tenantId,
          enabled: input.enabled,
          actorUserId: ctx.session.user.id,
          actorType: "seller",
        });
      } catch (error) {
        if (error instanceof Error && error.message === "assistant_not_ready") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "L’assistant n’est pas encore prêt. Connectez WhatsApp et ajoutez au moins un article disponible avec un prix.",
            cause: error,
          });
        }
        throw error;
      }
    }),
});
