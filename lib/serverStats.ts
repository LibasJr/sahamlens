// Analytics in-memory buat halaman /admin - HANYA dipakai dari Route Handler Node.js
// (bukan middleware.ts). Next.js menjalankan middleware di Edge Runtime (isolate V8 terpisah),
// jadi globalThis di sana TIDAK sama dengan globalThis di route handler biasa - server-side
// rate limit di middleware.ts dan analytics di sini sengaja jadi dua counter yang terpisah,
// bukan disatukan secara keliru.
//
// Catatan jujur: ini in-memory (reset kalau server restart) dan cuma tahu apa yang benar-benar
// lewat API server (hit /api/stock/[ticker]). Watchlist user TIDAK pernah dikirim ke server sama
// sekali (murni localStorage per browser), jadi tidak mungkin ada "watchlist paling banyak" yang
// jujur di sini - makanya tidak diklaim di halaman /admin.

interface HitEntry {
  ip: string;
  ticker: string;
  time: number;
}

const MAX_LOG = 5000;

const g = globalThis as unknown as { __sahamlensStats?: HitEntry[] };
if (!g.__sahamlensStats) g.__sahamlensStats = [];
const hits = g.__sahamlensStats;

export function recordAnalisaHit(ip: string, ticker: string) {
  hits.push({ ip, ticker: ticker.toUpperCase(), time: Date.now() });
  if (hits.length > MAX_LOG) hits.shift();
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function getStatsToday() {
  const since = startOfToday();
  const todayHits = hits.filter((h) => h.time >= since);

  const byTicker = new Map<string, number>();
  const byIp = new Map<string, number>();
  for (const h of todayHits) {
    byTicker.set(h.ticker, (byTicker.get(h.ticker) || 0) + 1);
    byIp.set(h.ip, (byIp.get(h.ip) || 0) + 1);
  }

  const topTickers = Array.from(byTicker.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([symbol, count]) => ({ symbol, count }));

  const topIps = Array.from(byIp.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([ip, count]) => ({ ip, count }));

  return {
    total: todayHits.length,
    topTickers,
    topIps,
    processStartedNote: 'Angka ini in-memory sejak server terakhir restart, bukan histori permanen.',
  };
}
