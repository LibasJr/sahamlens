const IDX_EQUITY_RE = /^[A-Z0-9]{1,10}(?:\.JK)?$/;
const ALLOWED_MARKET_SYMBOLS = new Set(['^JKSE']);

export function normalizeIdxTickerParam(raw: unknown, options: { allowMarketIndex?: boolean } = {}): string | null {
  if (typeof raw !== 'string') return null;
  let decoded = raw;
  try {
    // Next/Vercel normally decode dynamic route params once, but links that pass
    // encoded market index symbols can arrive as "%5EJKSE" or, after redirects,
    // "%255EJKSE". Decode a small fixed number of times so IHSG search remains
    // robust without accepting arbitrary malformed ticker strings.
    for (let i = 0; i < 2; i++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch { return null; }
  const value = decoded.trim().toUpperCase();
  if (options.allowMarketIndex && (value === 'IHSG' || value === 'JKSE' || value === '^JKSE.JK')) return '^JKSE';
  if (options.allowMarketIndex && ALLOWED_MARKET_SYMBOLS.has(value)) return value;
  if (!IDX_EQUITY_RE.test(value)) return null;
  return value.endsWith('.JK') ? value : `${value}.JK`;
}

export function isValidIdxTickerParam(raw: unknown, options: { allowMarketIndex?: boolean } = {}): boolean {
  return normalizeIdxTickerParam(raw, options) !== null;
}
