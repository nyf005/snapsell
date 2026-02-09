-- One pending subscription payment per tenant+plan to avoid duplicate rows on double-click or concurrent requests.
-- Remove existing duplicates first (keep the most recent pending per tenant+plan).
DELETE FROM subscription_payments
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (PARTITION BY tenant_id, plan ORDER BY created_at DESC) AS rn
    FROM subscription_payments
    WHERE status = 'pending' AND type = 'subscription'
  ) sub
  WHERE rn > 1
);

CREATE UNIQUE INDEX subscription_payments_one_pending_per_tenant_plan
ON subscription_payments (tenant_id, plan)
WHERE status = 'pending' AND type = 'subscription';
