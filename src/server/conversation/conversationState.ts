import { db } from "~/server/db";

/** Returns the ConversationState for a given tenant+phone, or null if none exists. */
export async function getConversationState(tenantId: string, phone: string) {
  return db.conversationState.findUnique({
    where: { tenantId_phone: { tenantId, phone } },
  });
}

/** Sets handedOff = true for a client. Creates the row if it doesn't exist. */
export async function setHandedOff(tenantId: string, phone: string, handedOff: boolean) {
  const state = await db.conversationState.upsert({
    where: { tenantId_phone: { tenantId, phone } },
    create: { tenantId, phone, handedOff },
    update: { handedOff },
  });
  if (handedOff) {
    const window = await db.conversationWindow.findFirst({
      where: { tenantId, customerPhone: phone, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" }, select: { id: true },
    });
    if (window) await db.conversationMetric.updateMany({
      where: { id: window.id, tenantId }, data: { handedOff: true },
    });
  }
  return state;
}
