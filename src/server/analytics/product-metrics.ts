import { db } from "~/server/db";

/** Cohorte de 30 jours, bornée en SQL ; toutes les requêtes sont isolées par boutique. */
export async function getProductMetrics(tenantId: string, now = new Date()) {
  const since = new Date(now.getTime() - 30 * 86400_000);
  const [reservations, converted, conversations, handedOff, firstConfirmation, preparation] = await Promise.all([
    db.reservation.count({ where: { tenantId, createdAt: { gte: since, lte: now } } }),
    db.reservation.count({ where: { tenantId, createdAt: { gte: since, lte: now }, order: { isNot: null } } }),
    db.conversationMetric.count({ where: { tenantId, startedAt: { gte: since, lte: now } } }),
    db.conversationMetric.count({ where: { tenantId, startedAt: { gte: since, lte: now }, handedOff: true } }),
    db.$queryRaw<Array<{ seconds: number }>>`
      SELECT EXTRACT(EPOCH FROM (MIN(m.sent_at) - t.created_at))::float8 AS seconds
      FROM tenants t JOIN messages_out m ON m.tenant_id = t.id
      WHERE t.id = ${tenantId} AND m.purpose = 'order_confirmation'
        AND m.sent_at IS NOT NULL AND m.sent_at <= ${now}
      GROUP BY t.created_at`,
    db.$queryRaw<Array<{ seconds: number | null; samples: number }>>`
      WITH durations AS (
        SELECT o.id, EXTRACT(EPOCH FROM (MIN(shipped.created_at) - closed.closed_at)) AS seconds
        FROM orders o JOIN reservations r ON r.id = o.reservation_id
        JOIN LATERAL (
          SELECT MIN(e.created_at) AS closed_at FROM event_log e
          WHERE e.tenant_id = ${tenantId} AND e.entity_id = r.live_session_id
            AND e.event_type = 'live_session_closed'
        ) closed ON closed.closed_at IS NOT NULL
        JOIN event_log shipped ON shipped.entity_id = o.id AND shipped.tenant_id = ${tenantId}
          AND shipped.event_type = 'order.status_changed' AND shipped.payload->>'to' = 'in_delivery'
        WHERE o.tenant_id = ${tenantId} AND closed.closed_at >= ${since}
          AND shipped.created_at >= closed.closed_at AND shipped.created_at <= ${now}
        GROUP BY o.id, closed.closed_at
      ) SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY seconds)::float8 AS seconds,
        COUNT(*)::int AS samples FROM durations`,
  ]);
  return {
    since, reservations, converted,
    conversionPercent: reservations ? Math.round(converted / reservations * 100) : null,
    conversations, handedOff,
    handoffPercent: conversations ? Math.round(handedOff / conversations * 100) : null,
    firstConfirmationSeconds: firstConfirmation[0]?.seconds ?? null,
    preparationSeconds: preparation[0]?.seconds ?? null,
    preparationSamples: preparation[0]?.samples ?? 0,
  };
}
