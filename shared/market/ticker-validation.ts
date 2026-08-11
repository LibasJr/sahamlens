const IDX_EQUITY_RE = /^[A-Z0-9]{1,10}(?:\.JK)?$/;
const ALLOWED_MARKET_SYMBOLS = new Set(['^JKSE']);

export function normalizeIdxTickerParam(raw: unknown, options: { allowMarketIndex?: boolean } = {}): string | null {
  if (typeof raw !== 'string') return null;
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { return null; }
  const value = decoded.trim().toUpperCase();
  if (options.allowMarketIndex && (value === 'IHSG' || value === 'JKSE')) return '^JKSE';
  if (options.allowMarketIndex && ALLOWED_MARKET_SYMBOLS.has(value)) return value;
  if (!IDX_EQUITY_RE.test(value)) return null;
  return value.endsWith('.JK') ? value : `${value}.JK`;
}

export function isValidIdxTickerParam(raw: unknown, options: { allowMarketIndex?: boolean } = {}): boolean {
  return normalizeIdxTickerParam(raw, options) !== null;
}
