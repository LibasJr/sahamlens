import { TICKERS } from './tickers';

// Daftar saham likuid LQ45/blue-chip - dipakai sebagai kamus nama emiten (getTickerName)
// dan daftar simbol umum. BUKAN daftar "trending": tidak ada satu pun pengukuran
// popularitas/volume di baliknya (lihat catatan L-1 di bawah).
export const TRENDING_SYMBOLS = [
  'BBCA', 'BBRI', 'BMRI', 'BBNI', 'TLKM', 'ASII', 'ADRO', 'ANTM', 'ICBP', 'UNVR',
  'GOTO', 'MDKA', 'PGAS', 'INDF', 'KLBF', 'PTBA', 'SMGR', 'INCO', 'ITMG', 'AKRA',
  'UNTR', 'CPIN', 'EXCL', 'MEDC', 'BRIS',
];

const NAME_BY_SYMBOL: Record<string, string> = Object.fromEntries(
  TICKERS.map((t) => [t.symbol.replace('.JK', ''), t.name])
);

// BUG FIX (audit logika & algoritma 2026-08-05, temuan L-1): fungsi lama
// `pickTrendingTicker()` memilih satu simbol dengan `Math.random()` lalu menamainya
// "trending" - klaim tentang perhatian pasar yang tidak pernah diukur dari apa pun.
// Pemakaiannya (components/Sidebar.tsx) sebenarnya cuma butuh SATU emiten default untuk
// tautan menu LensAI saat pengguna belum pernah mencari apa pun. Diganti default yang
// tetap & tidak mengklaim apa-apa. Kalau kelak butuh "trending" sungguhan, turunkan dari
// data nyata (topValue/topVolume di market-summary.service.ts), bukan dari acak.

/** Emiten default untuk tautan yang butuh satu simbol sebelum pengguna memilih sendiri.
 * BBCA dipilih karena paling likuid & paling mungkin punya data lengkap - bukan klaim
 * bahwa ia sedang trending. */
export function defaultTicker(): { symbol: string; name: string } {
  const symbol = 'BBCA';
  return { symbol, name: NAME_BY_SYMBOL[symbol] || symbol };
}

export function getTickerName(symbol: string): string {
  return NAME_BY_SYMBOL[symbol.replace('.JK', '')] || symbol;
}
