import { describe, expect, it } from "vitest";
import { inboundMessageForQueueSchema, metaWebhookSchema } from "./webhook";

describe("WhatsApp basket crosses both validation boundaries", () => {
  it("retains native order details and coerces numeric provider strings", () => {
    const raw = { object: "whatsapp_business_account", entry: [{ id: "waba", changes: [{ field: "messages", value: {
      messaging_product: "whatsapp", metadata: { display_phone_number: "123", phone_number_id: "phone" },
      messages: [{ from: "2250701020304", id: "wamid.cart", timestamp: "1710000000", type: "order", order: {
        catalog_id: "catalog", product_items: [{ product_retailer_id: "A12", quantity: "3", item_price: "5000", currency: "XOF" }],
      } }],
    } }] }] };
    const order = metaWebhookSchema.parse(raw).entry[0]!.changes[0]!.value.messages![0]!.order!;
    expect(order.product_items![0]!.quantity).toBe(3);
    const message = inboundMessageForQueueSchema.parse({ tenantId: "tenant", providerMessageId: "wamid.cart", from: "+2250701020304", body: "", correlationId: "cart", providerSentAt: "2024-03-09T16:00:00.000Z", orderPayload: {
      catalogId: order.catalog_id, items: order.product_items!.map(item => ({ productRetailerId: item.product_retailer_id, quantity: item.quantity, itemPrice: item.item_price, currency: item.currency })),
    } });
    expect(message.orderPayload?.items).toEqual([{ productRetailerId: "A12", quantity: 3, itemPrice: 5000, currency: "XOF" }]);
    expect(message.providerSentAt).toBe("2024-03-09T16:00:00.000Z");
  });
});
