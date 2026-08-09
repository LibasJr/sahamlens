const IDX_EQUITY_RE = /^[A-Z0-9]{1,10}(?:\.JK)?$/;
const ALLOWED_MARKET_SYMBOLS = new Set(['^JKSE']);

export function normalizeIdxTickerParam(raw: unknown, options: { allowMarketIndex?: boolean } = {}): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toUpperCase();
  if (options.allowMarketIndex && ALLOWED_MARKET_SYMBOLS.has(value)) return value;
  if (!IDX_EQUITY_RE.test(value)) return null;
  return value.endsWith('.JK') ? value : `${value}.JK`;
}

export function isValidIdxTickerParam(raw: unknown, options: { allowMarketIndex?: boolean } = {}): boolean {
  return normalizeIdxTickerParam(raw, options) !== null;
}
