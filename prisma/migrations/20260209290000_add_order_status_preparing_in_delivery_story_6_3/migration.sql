-- Story 6.3: OrderStatus fulfillment (preparing, in_delivery)
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'preparing' BEFORE 'delivered';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'in_delivery' BEFORE 'delivered';
