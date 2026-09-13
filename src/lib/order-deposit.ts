/** Snapshot in cents; XOF requests round up to a whole franc, never above the total. */
export function calculateDeposit(unitCents: number | null | undefined, quantity: number, percent: number | null | undefined) {
  if (unitCents == null || !Number.isInteger(unitCents) || unitCents < 0 || !Number.isInteger(quantity) || quantity < 1) return null;
  const total = unitCents * quantity;
  if (!Number.isSafeInteger(total) || total > 2_147_483_647 || percent == null || !Number.isInteger(percent) || percent < 1 || percent > 100) return null;
  return { itemsTotalCents: total, depositPercentSnapshot: percent, depositAmountCents: Math.min(total, Math.ceil(total * percent / 10_000) * 100) };
}
