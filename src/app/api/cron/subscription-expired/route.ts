import { NextResponse } from "next/server";
import { requireCronAuthorization } from "~/server/cron/auth";
import { runSubscriptionExpiredJob } from "~/server/workers/subscription-expired";

/**
 * Cron job to handle expired subscriptions.
 * Run daily at midnight to check for subscriptions past expiration date.
 *
 * Path: /api/cron/subscription-expired
 * Schedule: daily at midnight (cron: "0 0 * * *")
 */
export async function GET(request: Request) {
  const unauthorized = requireCronAuthorization(request);
  if (unauthorized) return unauthorized;

  const result = await runSubscriptionExpiredJob();
  return NextResponse.json(result);
}
