const SELLER_CREATE_ITEM_PATTERN = /^([A-Za-z]+\d+)(?:\s*x\s*(\d+))?$/i;
const SELLER_CREATE_ITEM_OFFLIVE_PATTERN = /^ajout\s+([A-Za-z]+\d+)(?:\s*x\s*(\d+))?$/i;

export type SellerCreateItemIntent = {
  code: string;
  quantity: number;
};

function parseQuantity(match: RegExpMatchArray): number {
  return match[2] ? Math.max(1, parseInt(match[2], 10)) : 1;
}

export function parseSellerCreateItemIntent(body: string): SellerCreateItemIntent | null {
  const trimmed = body.trim();
  if (!trimmed.length) return null;
  const match = trimmed.match(SELLER_CREATE_ITEM_PATTERN);
  if (!match) return null;
  return { code: match[1]!, quantity: parseQuantity(match) };
}

export function parseSellerOffLiveCreateItemIntent(body: string): SellerCreateItemIntent | null {
  const trimmed = body.trim();
  if (!trimmed.length) return null;
  const match = trimmed.match(SELLER_CREATE_ITEM_OFFLIVE_PATTERN);
  if (!match) return null;
  return { code: match[1]!, quantity: parseQuantity(match) };
}

export function looksLikeImplicitSellerCreateItem(body: string): boolean {
  return SELLER_CREATE_ITEM_PATTERN.test(body.trim());
}
