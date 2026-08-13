import { db } from "~/server/db";

export const ASSISTANT_BLOCKERS = ["whatsapp", "catalogue"] as const;
export type AssistantBlocker = (typeof ASSISTANT_BLOCKERS)[number];

export const ASSISTANT_WARNINGS = ["delivery", "replies", "hours"] as const;
export type AssistantWarning = (typeof ASSISTANT_WARNINGS)[number];

export type AssistantStatus = {
  enabled: boolean;
  state: "active" | "paused" | "unavailable";
  connected: boolean;
  ready: boolean;
  blockers: AssistantBlocker[];
  warnings: AssistantWarning[];
  sellableItemCount: number;
  updatedAt: Date | null;
  updatedBy: string | null;
  activatedAt: Date | null;
};

/**
 * État unique de l'assistant, partagé par le webhook, le tableau de bord,
 * les réglages et le support. Les prérequis sont recalculés depuis les données
 * réelles : aucun second état de checklist ne peut dériver de la boutique.
 */
export async function getAssistantStatus(tenantId: string): Promise<AssistantStatus> {
  const [tenant, sellableItemCount, deliveryCount] = await Promise.all([
    db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        assistantEnabled: true,
        assistantUpdatedAt: true,
        assistantUpdatedBy: true,
        assistantActivatedAt: true,
        metaPhoneNumberId: true,
        metaWabaId: true,
        metaAccessToken: true,
        faqDelivery: true,
        faqPayment: true,
        faqLocation: true,
        faqAvailability: true,
        businessHoursStart: true,
        businessHoursEnd: true,
      },
    }),
    db.catalogueItem.count({
      where: {
        tenantId,
        amount: { not: null },
        availableQty: { gt: 0 },
      },
    }),
    Promise.all([
      db.deliveryZone.count({ where: { tenantId } }),
      db.deliveryFeeCommune.count({ where: { tenantId } }),
    ]).then(([zones, communes]) => zones + communes),
  ]);

  const connected = Boolean(
    tenant?.metaPhoneNumberId && tenant.metaWabaId && tenant.metaAccessToken,
  );
  const blockers: AssistantBlocker[] = [];
  if (!connected) blockers.push("whatsapp");
  if (sellableItemCount === 0) blockers.push("catalogue");

  const warnings: AssistantWarning[] = [];
  if (deliveryCount === 0) warnings.push("delivery");
  if (
    !tenant?.faqDelivery &&
    !tenant?.faqPayment &&
    !tenant?.faqLocation &&
    !tenant?.faqAvailability
  ) {
    warnings.push("replies");
  }
  if (!tenant?.businessHoursStart || !tenant.businessHoursEnd) {
    warnings.push("hours");
  }

  const enabled = tenant?.assistantEnabled ?? false;
  return {
    enabled,
    state: enabled ? (connected ? "active" : "unavailable") : "paused",
    connected,
    ready: blockers.length === 0,
    blockers,
    warnings,
    sellableItemCount,
    updatedAt: tenant?.assistantUpdatedAt ?? null,
    updatedBy: tenant?.assistantUpdatedBy ?? null,
    activatedAt: tenant?.assistantActivatedAt ?? null,
  };
}

export async function setAssistantEnabled(input: {
  tenantId: string;
  enabled: boolean;
  actorUserId: string;
  actorType: "seller" | "ops";
}): Promise<AssistantStatus> {
  const current = await getAssistantStatus(input.tenantId);
  if (input.enabled && !current.ready) {
    const error = new Error("assistant_not_ready");
    Object.assign(error, { blockers: current.blockers });
    throw error;
  }

  const now = new Date();
  const correlationId = crypto.randomUUID();
  await db.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: input.tenantId },
      data: {
        assistantEnabled: input.enabled,
        assistantUpdatedAt: now,
        assistantUpdatedBy: input.actorUserId,
        ...(input.enabled && !current.activatedAt ? { assistantActivatedAt: now } : {}),
      },
    });
    await tx.eventLog.create({
      data: {
        tenantId: input.tenantId,
        eventType: input.enabled ? "assistant.activated" : "assistant.paused",
        entityType: "tenant",
        entityId: input.tenantId,
        correlationId,
        actorType: input.actorType,
        payload: { actorUserId: input.actorUserId },
      },
    });
  });

  return {
    ...current,
    enabled: input.enabled,
    state: input.enabled ? "active" : "paused",
    updatedAt: now,
    updatedBy: input.actorUserId,
    activatedAt: current.activatedAt ?? (input.enabled ? now : null),
  };
}
