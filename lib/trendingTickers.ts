import { TICKERS } from './tickers';

// Saham likuid LQ45/blue-chip yang paling umum jadi perhatian trader ritel Indonesia.
// Dipakai supaya kartu unggulan di dashboard publik tidak selalu BBCA - setiap
// refresh/mount memilih satu secara acak dari daftar ini.
export const TRENDING_SYMBOLS = [
  'BBCA', 'BBRI', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'ADRO', 'ANTM', 'ICBP', 'UNVR',
  'GOTO', 'MDKA', 'PGAS', 'INDF', 'KLBF', 'PTBA', 'SMGR', 'INCO', 'ITMG', 'AKRA',
  'UNTR', 'CPIN', 'EXCL', 'MEDC', 'BRIS',
];

const NAME_BY_SYMBOL: Record<string, string> = Object.fromEntries(
  TICKERS.map((t) => [t.symbol.replace('.JK', ''), t.name])
);

export function pickTrendingTicker(): { symbol: string; name: string } {
  const symbol = TRENDING_SYMBOLS[Math.floor(Math.random() * TRENDING_SYMBOLS.length)];
  return { symbol, name: NAME_BY_SYMBOL[symbol] || symbol };
}

export function getTickerName(symbol: string): string {
  return NAME_BY_SYMBOL[symbol.replace('.JK', '')] || symbol;
}
