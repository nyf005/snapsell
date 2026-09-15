import { z } from "zod";
import { decrypt } from "~/lib/crypto";
import { isOrderStatusTemplate, type MetaTemplate } from "~/lib/whatsapp-template";
import { db } from "~/server/db";

const statusContext = z.object({
  kind: z.literal("order_status"),
  orderNumber: z.string().min(1),
  status: z.enum(["in_delivery", "delivered", "cancelled"]),
});
const productConsent = z.object({
  kind: z.literal("requested_product"),
  consentConfirmedBy: z.string().min(1),
  consentConfirmedAt: z.string().datetime(),
});

type SendingDecision =
  | { mode: "freeform" }
  | { mode: "blocked"; reason: string }
  | { mode: "template"; name: string; language: string; parameters: string[] };

/** Receipt/replay time is deliberately excluded: only a real client message opens the window. */
export async function isServiceWindowOpen(tenantId: string, phone: string, now = new Date()): Promise<boolean> {
  const last = await db.messageIn.findFirst({
    where: { tenantId, from: phone, providerSentAt: { not: null, lte: now } },
    orderBy: { providerSentAt: "desc" },
    select: { providerSentAt: true },
  });
  if (!last?.providerSentAt) return false;
  const elapsed = now.getTime() - last.providerSentAt.getTime();
  return elapsed >= 0 && elapsed < 24 * 60 * 60 * 1000;
}

/** Rechecked by the sender on every attempt, including after queue delays. */
export async function decideSendingPolicy(
  tenantId: string,
  phone: string,
  context: unknown,
  isProductCard = false,
): Promise<SendingDecision> {
  if (isProductCard && !productConsent.safeParse(context).success) {
    return { mode: "blocked", reason: "whatsapp_product_consent_missing" };
  }
  if (await isServiceWindowOpen(tenantId, phone)) return { mode: "freeform" };
  const parsed = statusContext.safeParse(context);
  if (!parsed.success) return { mode: "blocked", reason: "whatsapp_window_closed" };

  const consent = await db.messagingConsent.findUnique({
    where: { tenantId_phone_scope: { tenantId, phone, scope: "order_updates" } },
  });
  if (!consent) return { mode: "blocked", reason: "whatsapp_consent_missing" };
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { hasNotificationsOutside24h: true, metaWabaId: true, metaAccessToken: true, whatsappTemplateName: true, whatsappTemplateLanguage: true },
  });
  if (tenant && !tenant.hasNotificationsOutside24h) return { mode: "blocked", reason: "whatsapp_template_plan_required" };
  if (!tenant?.metaWabaId || !tenant.metaAccessToken || !tenant.whatsappTemplateName || !tenant.whatsappTemplateLanguage) {
    return { mode: "blocked", reason: "whatsapp_template_missing" };
  }

  // Approval may be revoked after selection. Never fall back to free text on errors.
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(tenant.metaWabaId)}/message_templates?name=${encodeURIComponent(tenant.whatsappTemplateName)}&fields=name,language,category,status,components&limit=100`,
    { headers: { Authorization: `Bearer ${decrypt(tenant.metaAccessToken)}` }, signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok) throw new Error("WhatsApp template approval could not be verified");
  const data = await response.json() as { data?: MetaTemplate[] };
  const template = data.data?.find(candidate =>
    candidate.name === tenant.whatsappTemplateName
    && candidate.language === tenant.whatsappTemplateLanguage
    && isOrderStatusTemplate(candidate),
  );
  if (!template) return { mode: "blocked", reason: "whatsapp_template_incompatible" };
  const status = { in_delivery: "en livraison", delivered: "livrée", cancelled: "annulée" }[parsed.data.status];
  return { mode: "template", name: template.name, language: template.language, parameters: [parsed.data.orderNumber, status] };
}
