import { TRPCError } from "@trpc/server";
import { hash } from "bcrypt";

import { db } from "~/server/db";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { Role } from "../../../../generated/prisma";
import { signupInputSchema } from "./auth.schema";

export const authRouter = createTRPCRouter({
  signup: publicProcedure
    .input(signupInputSchema)
    .mutation(async ({ input }) => {
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
        const tenant = await tx.tenant.create({
          data: { name: input.tenantName },
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
});
