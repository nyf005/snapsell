import { NextResponse } from "next/server";

import { env } from "~/env";

export function requireCronAuthorization(request: Request): NextResponse | null {
  if (!env.CRON_SECRET) {
    return new NextResponse("Cron secret not configured", { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  return null;
}
