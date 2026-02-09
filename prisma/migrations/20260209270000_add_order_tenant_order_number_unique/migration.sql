-- Story 4.5 code review: unicité (tenant_id, order_number) pour éviter doublons en concurrence
CREATE UNIQUE INDEX "orders_tenant_id_order_number_key" ON "orders"("tenant_id", "order_number");
