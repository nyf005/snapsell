import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";

import { env } from "~/env";
import { auth } from "~/server/auth";
import { appRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a HTTP request (e.g. when you make requests from Client Components).
 * We pass { headers } (not the raw Request) so NextAuth uses the "API Routes" branch and calls
 * getSession() to read the session from cookies instead of the "Request" (middleware) branch.
 */
const createContext = async (req: NextRequest) => {
  const session = await auth(
    { headers: req.headers } as Parameters<typeof auth>[0],
    { headers: new Headers(), appendHeader: () => {} } as Parameters<typeof auth>[1]
  );
  return createTRPCContext({
    headers: req.headers,
    session,
  });
};

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
    onError:
      env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(
              `❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}`
            );
          }
        : undefined,
  });

export { handler as GET, handler as POST };
