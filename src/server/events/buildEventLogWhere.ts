/**
 * Construit le filtre Prisma EventLog (partagé entre eventLog router et ops router).
 * Factorisé pour éviter la duplication (CR 7B-1 L2).
 */

import type { Prisma } from "../../../generated/prisma";

type EventLogWhereInput = Prisma.EventLogWhereInput;

export interface EventLogFilterOpts {
  eventType?: string;
  dateFrom?: string;
  dateTo?: string;
  correlationId?: string;
}

export function buildEventLogWhere(
  tenantId: string | undefined,
  opts: EventLogFilterOpts,
): EventLogWhereInput {
  const where: EventLogWhereInput = {};
  if (tenantId) {
    where.tenantId = tenantId;
  }
  if (opts.eventType) {
    where.eventType = opts.eventType;
  }
  if (opts.correlationId) {
    where.correlationId = opts.correlationId;
  }
  if (opts.dateFrom ?? opts.dateTo) {
    where.createdAt = {};
    if (opts.dateFrom) {
      const from = new Date(opts.dateFrom);
      from.setUTCHours(0, 0, 0, 0);
      (where.createdAt as Record<string, Date>).gte = from;
    }
    if (opts.dateTo) {
      const to = new Date(opts.dateTo);
      to.setUTCHours(23, 59, 59, 999);
      (where.createdAt as Record<string, Date>).lte = to;
    }
  }
  return where;
}
