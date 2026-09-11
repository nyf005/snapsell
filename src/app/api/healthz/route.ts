/**
 * GET /api/healthz — Health check endpoint pour Railway et monitoring externe.
 *
 * Vérifie:
 *   1. Disponibilité du process (réponse HTTP)
 *   2. Connectivité base de données (ping Prisma)
 *
 * Utilisé par:
 *   - Railway restart policy (health check probe)
 *   - Better Uptime / Checkly pour alerting
 *
 * Réponses:
 *   200 { status: "ok", db: "ok" }          — tout est sain
 *   503 { status: "degraded", db: "error" } — DB inaccessible
 */
import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { getMessagingHealth } from "~/server/workers/health";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    const health = await getMessagingHealth();
    const ok = health.worker === "ok" && health.outbox === "ok";
    return NextResponse.json({ status: ok ? "ok" : "degraded", db: "ok", ...health }, {
      status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { status: "degraded", db: "error" },
      { status: 503 },
    );
  }
}
