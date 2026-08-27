import { runController } from '@/shared/http/next-response.adapter';
import { getMarketSummary, type MarketSummary } from '@/modules/market';
import { parseBreakoutCache, type BreakoutCacheEntry, type CrossCacheEntry } from '@/modules/market/contracts';
import { getOrCompute, cacheGet } from '@/shared/cache/redis-cache';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { CACHE_TTL_SEC, CDN_FRESHNESS_SEC, publicCacheHeaders } from '@/shared/cache/ttl-policy';
import { apiOk } from '@/shared/http/api-response';

// Publik (tanpa login) - dipakai widget "Hari Ini AI Menemukan" di halaman utama (Dashboard.tsx)
// DAN halaman AI Pick (app/breakout-radar/page.tsx, tab per kategori via ?cat=) untuk
// menarik pengunjung buka aplikasi tiap hari SEBELUM signup. Semua angka di sini dihitung
// ulang dari data real yang SUDAH dipakai fitur lain (bukan metrik baru yang dikarang) -
// lihat komentar per kategori di bawah. `items` = daftar simbol saja (dipakai widget
// ringkas di halaman utama), `detail` = baris lengkap (harga+metrik, dipakai tab AI Pick).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MARKET_SUMMARY_CACHE_KEY = COMPUTED_CACHE_KEY.MARKET_SUMMARY;
const BREAKOUT_CACHE_KEY = 'sahamlens:cache:computed:breakout-radar';
const DETAIL_CAP = 20;

function category<T extends { symbol: string }, D>(items: T[], mapDetail: (item: T) => D) {
  return {
    count: items.length,
    items: items.slice(0, 5).map((s) => (s.symbol || '').replace('.JK', '')),
    detail: items.slice(0, DETAIL_CAP).map(mapDetail),
  };
}

export async function GET(request: Request) {
  return runController(async () => {
    try {
      // Reuse cache key yang sama dengan /api/market-summary supaya tidak scan ulang
      // 250 saham dua kali (cache-nya sudah dipenuhi request landing page yang sama).
      const summary = await getOrCompute(MARKET_SUMMARY_CACHE_KEY, CACHE_TTL_SEC.MARKET_SUMMARY, getMarketSummary);

      // Breakout radar & cross signals di-refresh cron tiap 5 menit (app/api/cron/breakout-scan)
      // - baca cache dulu, fallback live scan kalau cache belum pernah terisi.
      const cachedBreakoutRaw = await cacheGet<unknown>(BREAKOUT_CACHE_KEY);
      // Batas proses: payload ini ditulis oleh job cron terpisah lewat Redis, jadi divalidasi
      // runtime (parseBreakoutCache) alih-alih dipercaya sebagai data bertipe luas. Payload yang gagal
      // validasi diperlakukan sama seperti cache kosong: kategori breakout/cross tampil kosong
      // dan ditandai stale, bukan meneruskan bentuk data yang mungkin sudah salah field ke publik.
      const cachedBreakout = parseBreakoutCache(cachedBreakoutRaw);
      // Tanpa fallback live-scan: kalau cache belum terisi, kategori breakout & cross
      // tampil kosong sampai cron mengisinya. Memindai di sini berarti request pengguna
      // menanggung full active-universe fetch Yahoo.
      const breakoutList: BreakoutCacheEntry[] = cachedBreakout?.data ?? [];
      const crossSignals: { golden: CrossCacheEntry[]; dead: CrossCacheEntry[] } =
        cachedBreakout?.crossSignals ?? { golden: [], dead: [] };
      // BUG FIX (audit integritas data 2026-08-03): TTL cache ini diperpanjang ke 3 hari
      // (lihat shared/cache/ttl-policy.ts BREAKOUT_RADAR) supaya kategori breakout/golden/
      // dead cross tidak kosong total di luar jam bursa - konsekuensinya data yang
      // disajikan bisa dari sesi sebelumnya. `breakoutStale`/`breakoutAsOf` memberi tahu
      // UI kapan harus bilang jujur "data sesi terakhir".
      const breakoutAsOf: string | null = cachedBreakout?.lastUpdate ?? null;
      const breakoutStale = breakoutAsOf ? (Date.now() - new Date(breakoutAsOf).getTime()) / 60000 > 20 : true;

      // "Undervalue": proxy RSI oversold MURNI (rsi < 30) - definisi yang sama persis
      // dipakai fitur RSI Oversold sebelum diperlonggar jadi ranking (lihat market-summary.service.ts),
      // bukan metrik baru.
      const undervalueList = summary.topRsiOversold.filter((s) => s.rsi < 30);

      // "Akumulasi Asing Berkelanjutan" (2026-08-01, gantikan "Momentum Mingguan" -
      // proxy harga saja, kurang berguna sebagai sinyal berbeda dari Top Gainer) - saham
      // dengan streak >=3 hari netValue positif (volume x arah harga), lihat
      // modules/market/service/foreign-flow-proxy.ts. Sudah dihitung di getMarketSummary().
      const foreignAccumulationList = summary.topForeignAccumulation;

      const data = {
          attractive: category(summary.topTechnical, (s) => ({ symbol: s.symbol, price: s.price, changePct: s.changePct, metric: `Skor ${s.score}` })),
          // BARU (2026-08-01) - kategori ke-8 widget "Hari Ini AI Menemukan" (menggantikan
          // tombol "Lihat Analisis {ticker}" yang dihapus, supaya tidak ada ruang kosong).
          // Sudah dihitung di getMarketSummary() (topWeeklyGainers, real dari 250 saham),
          // tidak butuh fetch/hitung baru.
          weeklyGainer: category(summary.topWeeklyGainers, (s) => ({ symbol: s.symbol, price: s.price, changePct: s.changePct, metric: `+${s.changePct.toFixed(1)}% / 5D` })),
          relativeStrength: category(summary.topRelativeStrength, (s) => ({ symbol: s.symbol, price: s.price, changePct: s.changePct, metric: `RS ${s.relativeStrength5D >= 0 ? '+' : ''}${s.relativeStrength5D.toFixed(1)}% vs IHSG 5D` })),
          risky: category(summary.topTechnicalBearish, (s) => ({ symbol: s.symbol, price: s.price, changePct: s.changePct, metric: `Skor ${s.score}` })),
          undervalue: category(undervalueList, (s) => ({ symbol: s.symbol, price: s.price, changePct: s.changePct, metric: `RSI ${s.rsi}` })),
          breakout: {
            count: breakoutList.length,
            items: breakoutList.slice(0, 5).map((b) => b.symbol.replace('.JK', '')),
            detail: breakoutList.slice(0, DETAIL_CAP).map((b) => ({ symbol: b.symbol.replace('.JK', ''), price: b.price, changePct: parseFloat(b.change), metric: `Skor ${b.score} • RR ${b.rr}` })),
            stale: breakoutStale,
            asOf: breakoutAsOf,
          },
          goldenCross: {
            ...category(crossSignals.golden, (s) => ({
              symbol: s.symbol.replace('.JK', ''),
              price: s.price,
              changePct: parseFloat(s.change),
              metric: s.rr ? `Golden Cross • RR ${s.rr}` : 'Golden Cross • belum ada setup RR ≥ 1.5',
              tp1: typeof s.tp1 === 'number' ? s.tp1 : null,
              tp2: typeof s.tp2 === 'number' ? s.tp2 : null,
              cl1: typeof s.cl1 === 'number' ? s.cl1 : null,
              cl2: typeof s.cl2 === 'number' ? s.cl2 : null,
            })),
            stale: breakoutStale,
            asOf: breakoutAsOf,
          },
          deadCross: {
            ...category(crossSignals.dead, (s) => ({
              symbol: s.symbol.replace('.JK', ''),
              price: s.price,
              changePct: parseFloat(s.change),
              metric: 'Dead Cross',
              cl1: typeof s.cl1 === 'number' ? s.cl1 : null,
              cl2: typeof s.cl2 === 'number' ? s.cl2 : null,
            })),
            stale: breakoutStale,
            asOf: breakoutAsOf,
          },
          foreignAccumulation: category(foreignAccumulationList, (s) => ({ symbol: s.symbol, price: s.price, changePct: s.changePct, metric: `${s.streak} hari akumulasi` })),
          timestamp: summary.timestamp,
        };

      return {
        status: 200,
        body: {
          ...apiOk(data, {
            dataAsOf: breakoutAsOf ?? summary.timestamp ?? undefined,
            calculatedAt: summary.timestamp ?? undefined,
            source: 'market-summary + breakout-radar-cache',
            staleness: breakoutStale ? 'partially-stale' : 'fresh-cache',
            modelVersion: 'LENS_RADAR_DAILY_PICKS',
          }),
          // Backward-compatible fields while clients migrate to { ok, data, meta }.
          ...data,
        },
        headers: publicCacheHeaders(CDN_FRESHNESS_SEC.LENS_RADAR, CACHE_TTL_SEC.BREAKOUT_RADAR),
      };
    } catch (error) {
      console.error('Daily picks API error:', error);
      return { status: 500, body: { error: 'Internal Server Error' } };
    }
  }, request);
}
