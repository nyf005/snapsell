/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */
import { TRPCError } from "@trpc/server";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import type { Session } from "next-auth";
import { db } from "~/server/db";
import { isOpsUser, canManageGrid } from "~/lib/rbac";
import { checkTrpcRateLimit } from "~/lib/trpc-rate-limit";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: {
  headers: Headers;
  session: Session | null;
}) => {
  return {
    db,
    headers: opts.headers,
    session: opts.session,
  };
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    // `userKey` est posé par appError() (src/server/api/errors.ts). C'est la liste
    // blanche que formatError() consulte côté client : sans clé, rien n'est affiché
    // tel quel, on tombe sur un message générique.
    const userKey = (error as { userKey?: unknown }).userKey;
    return {
      ...shape,
      data: {
        ...shape.data,
        userKey: typeof userKey === "string" ? userKey : null,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Middleware for timing procedure execution and adding an artificial delay in development.
 *
 * You can remove this if you don't like it, but it can help catch unwanted waterfalls by simulating
 * network latency that would occur in production but not in local development.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();

  if (t._config.isDev) {
    // artificial delay in dev
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const result = await next();

  const end = Date.now();
  if (t._config.isDev) {
    console.log(`[TRPC] ${path} took ${end - start}ms to execute`);
  }

  return result;
});

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Authenticated session middleware — requires a valid session (any role).
 */
const enforceSession = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Session requise" });
  }
  return next({
    ctx: {
      ...ctx,
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});

/**
 * Tenant isolation middleware — requires a non-null tenantId.
 * Blocks OPS users (tenantId null) from tenant procedures.
 * Narrows tenantId type to string for downstream consumers.
 */
const enforceTenant = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user?.tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Accès tenant requis",
    });
  }
  return next({
    ctx: {
      ...ctx,
      tenantId: ctx.session.user.tenantId,
      session: {
        ...ctx.session,
        user: {
          ...ctx.session.user,
          tenantId: ctx.session.user.tenantId,
        },
      },
    },
  });
});

/**
 * Rate limiting middleware — 20 mutations/min par userId via Upstash Redis.
 * Désactivé silencieusement si UPSTASH_REDIS_REST_URL n'est pas configuré.
 */
const rateLimitMiddleware = t.middleware(async ({ ctx, next }) => {
  const userId = ctx.session?.user?.id;
  if (userId) {
    const allowed = await checkTrpcRateLimit(userId);
    if (!allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Trop de requêtes. Réessaie dans quelques secondes.",
      });
    }
  }
  return next();
});

/**
 * Protected (authenticated) procedure — requires a valid session + tenantId.
 * Use for all dashboard/tenant data.
 */
export const protectedProcedure = t.procedure
  .use(timingMiddleware)
  .use(enforceSession)
  .use(enforceTenant)
  .use(rateLimitMiddleware);

/**
 * Manager procedure — requires session + tenantId + role OWNER/MANAGER.
 * Note: .use() overrides the type and merges the context.
 */
export const managerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!canManageGrid(ctx.session.user.role as string)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Accès réservé aux administrateurs (Owner/Manager).",
    });
  }
  return next({
    ctx: {
      tenantId: ctx.session.user.tenantId,
    },
  });
});

/**
 * Ops procedure — requires role OPS (tenantId null).
 * Use for multi-tenant ops console endpoints (Story 7B.1).
 */
const enforceOps = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Session requise" });
  }
  if (!isOpsUser(ctx.session.user.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Accès réservé aux utilisateurs ops SnapSell",
    });
  }
  return next({
    ctx: {
      ...ctx,
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});

export const opsProcedure = t.procedure
  .use(timingMiddleware)
  .use(enforceSession)
  .use(enforceOps);
