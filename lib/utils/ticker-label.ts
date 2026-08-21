/**
 * Format a market-data symbol for user-facing labels.
 *
 * `.JK` is an exchange/provider identifier, not part of an IDX issuer code. Keep
 * it in API values and routes, but never expose it in search fields or labels.
 */
export function tickerLabel(symbol: string): string {
  return symbol.replace(/\.JK$/i, '');
}
