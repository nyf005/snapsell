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

/**
 * Profondeur d'historique du journal d'audit pour les plans sans « audit renforcé ».
 *
 * C'est le différenciant retenu pour l'entitlement `hasAdvancedFilters` (Pro) :
 * Free et Starter consultent les 90 derniers jours, Pro dispose de l'historique complet.
 *
 * Ne s'applique QU'AU journal d'audit — donnée forensique. Les commandes, elles, sont
 * de la donnée opérationnelle : elles restent accessibles sans limite à tous les plans.
 */
export const AUDIT_RETENTION_DAYS_WITHOUT_ADVANCED = 90;

export function buildEventLogWhere(
  tenantId: string | undefined,
  opts: EventLogFilterOpts,
  /** false ⇒ borne l'historique à AUDIT_RETENTION_DAYS_WITHOUT_ADVANCED jours. */
  hasAdvancedFilters = true,
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

  if (!hasAdvancedFilters) {
    const floor = new Date();
    floor.setUTCDate(floor.getUTCDate() - AUDIT_RETENTION_DAYS_WITHOUT_ADVANCED);
    floor.setUTCHours(0, 0, 0, 0);
    // On ne remplace pas une borne demandée plus récente : on ne fait que la relever.
    createdAt.gte = createdAt.gte && createdAt.gte > floor ? createdAt.gte : floor;
  }

  if (createdAt.gte ?? createdAt.lte) {
    where.createdAt = createdAt;
  }

  return where;
}
