/** One reviewed contract: placeholders cannot change the meaning or category. */
export const ORDER_STATUS_TEMPLATE_BODY = "Votre commande {{1}} est {{2}}. Répondez à ce message pour contacter la boutique.";
export type MetaTemplate = { name: string; language: string; category: string; status: string; components?: Array<{ type: string; text?: string }> };
export function isOrderStatusTemplate(template: MetaTemplate): boolean {
  return template.status === "APPROVED" && template.category === "UTILITY" && template.language === "fr"
    && template.components?.length === 1 && template.components[0]?.type === "BODY"
    && template.components[0].text === ORDER_STATUS_TEMPLATE_BODY;
}
