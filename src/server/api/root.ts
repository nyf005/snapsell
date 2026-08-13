import { authRouter } from "~/server/api/routers/auth";
import { assistantRouter } from "~/server/api/routers/assistant";
import { catalogueRouter } from "~/server/api/routers/catalogue";
import { conversationsRouter } from "~/server/api/routers/conversations";
import { dashboardRouter } from "~/server/api/routers/dashboard";
import { deliveryRouter } from "~/server/api/routers/delivery";
import { eventLogRouter } from "~/server/api/routers/eventLog";
import { invitationsRouter } from "~/server/api/routers/invitations";
import { liveRouter } from "~/server/api/routers/live";
import { onboardingRouter } from "~/server/api/routers/onboarding";
import { opsRouter } from "~/server/api/routers/ops";
import { ordersRouter } from "~/server/api/routers/orders";
import { proofsRouter } from "~/server/api/routers/proofs";
import { sellerPhonesRouter } from "~/server/api/routers/sellerPhones";
import { settingsRouter } from "~/server/api/routers/settings";
import { subscriptionRouter } from "~/server/api/routers/subscription";
import { teamRouter } from "~/server/api/routers/team";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  assistant: assistantRouter,
  auth: authRouter,
  catalogue: catalogueRouter,
  conversations: conversationsRouter,
  dashboard: dashboardRouter,
  settings: settingsRouter,
  sellerPhones: sellerPhonesRouter,
  delivery: deliveryRouter,
  eventLog: eventLogRouter,
  invitations: invitationsRouter,
  live: liveRouter,
  onboarding: onboardingRouter,
  ops: opsRouter,
  orders: ordersRouter,
  proofs: proofsRouter,
  subscription: subscriptionRouter,
  team: teamRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 */
export const createCaller = createCallerFactory(appRouter);
