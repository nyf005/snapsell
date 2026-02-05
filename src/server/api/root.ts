import { authRouter } from "~/server/api/routers/auth";
import { deliveryRouter } from "~/server/api/routers/delivery";
import { exampleRouter } from "~/server/api/routers/example";
import { invitationsRouter } from "~/server/api/routers/invitations";
import { sellerPhonesRouter } from "~/server/api/routers/sellerPhones";
import { settingsRouter } from "~/server/api/routers/settings";
import { teamRouter } from "~/server/api/routers/team";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  example: exampleRouter,
  auth: authRouter,
  settings: settingsRouter,
  sellerPhones: sellerPhonesRouter,
  delivery: deliveryRouter,
  invitations: invitationsRouter,
  team: teamRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 */
export const createCaller = createCallerFactory(appRouter);
