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

/** Historique complet, sans borne de date. */
export const AUDIT_RETENTION_UNLIMITED = -1;

/**
 * Construit le filtre, en bornant éventuellement la profondeur d'historique.
 *
 * La profondeur est un différenciant de plan : 30 jours en Free, 90 en Starter,
 * illimité en Pro (voir `auditRetentionDays` dans subscription-plans.ts).
 *
 * Ne s'applique QU'AU journal d'audit — donnée forensique. Les commandes, elles, sont
 * de la donnée opérationnelle : elles restent accessibles sans limite à tous les plans.
 *
 * @param retentionDays nombre de jours consultables ; `-1` pour l'historique complet.
 */
export function buildEventLogWhere(
  tenantId: string | undefined,
  opts: EventLogFilterOpts,
  retentionDays: number = AUDIT_RETENTION_UNLIMITED,
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

  const createdAt: { gte?: Date; lte?: Date } = {};

  if (opts.dateFrom) {
    const from = new Date(opts.dateFrom);
    from.setUTCHours(0, 0, 0, 0);
    createdAt.gte = from;
  }
  if (opts.dateTo) {
    const to = new Date(opts.dateTo);
    to.setUTCHours(23, 59, 59, 999);
    createdAt.lte = to;
  }

  if (retentionDays !== AUDIT_RETENTION_UNLIMITED) {
    const floor = new Date();
    floor.setUTCDate(floor.getUTCDate() - retentionDays);
    floor.setUTCHours(0, 0, 0, 0);
    // On ne remplace pas une borne demandée plus récente : on ne fait que la relever.
    createdAt.gte = createdAt.gte && createdAt.gte > floor ? createdAt.gte : floor;
  }

  if (createdAt.gte ?? createdAt.lte) {
    where.createdAt = createdAt;
  }

  return where;
}
