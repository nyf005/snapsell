/** Internal catalogue amounts use hundredths of a franc; subscriptions use francs. */
export const MAX_AMOUNT_CENTS = 2_147_483_647; // PostgreSQL Int storage limit
export const francsToCents = (francs: number): number => Math.round(francs * 100);
export const centsToFrancs = (cents: number): number => cents / 100;
