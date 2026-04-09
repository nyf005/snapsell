import { db } from "~/server/db";

/** Returns the ConversationState for a given tenant+phone, or null if none exists. */
export async function getConversationState(tenantId: string, phone: string) {
  return db.conversationState.findUnique({
    where: { tenantId_phone: { tenantId, phone } },
  });
}

/** Sets handedOff = true for a client. Creates the row if it doesn't exist. */
export async function setHandedOff(tenantId: string, phone: string, handedOff: boolean) {
  return db.conversationState.upsert({
    where: { tenantId_phone: { tenantId, phone } },
    create: { tenantId, phone, handedOff },
    update: { handedOff },
  });
}
