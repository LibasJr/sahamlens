import { NextResponse } from 'next/server';
import { getMarketSummary } from '@/modules/market';
import { scanBreakouts, scanCrossSignals } from '@/modules/recommendation';
import { getOrCompute, cacheGet } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';

// Publik (tanpa login) - dipakai widget "Hari Ini AI Menemukan" di halaman utama (Dashboard.tsx)
// DAN halaman AI Pick (app/breakout-radar/page.tsx, tab per kategori via ?cat=) untuk
// menarik pengunjung buka aplikasi tiap hari SEBELUM signup. Semua angka di sini dihitung
// ulang dari data real yang SUDAH dipakai fitur lain (bukan metrik baru yang dikarang) -
// lihat komentar per kategori di bawah. `items` = daftar simbol saja (dipakai widget
// ringkas di halaman utama), `detail` = baris lengkap (harga+metrik, dipakai tab AI Pick).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MARKET_SUMMARY_CACHE_KEY = 'sahamlens:cache:computed:market-summary';
const BREAKOUT_CACHE_KEY = 'sahamlens:cache:computed:breakout-radar';
const DETAIL_CAP = 20;

export async function GET() {
  try {
    // Reuse cache key yang sama dengan /api/market-summary supaya tidak scan ulang
    // 250 saham dua kali (cache-nya sudah dipenuhi request landing page yang sama).
    const summary = await getOrCompute(MARKET_SUMMARY_CACHE_KEY, CACHE_TTL_SEC.MARKET_SUMMARY, getMarketSummary);

    // Breakout radar & cross signals di-refresh cron tiap 5 menit (app/api/cron/breakout-scan)
    // - baca cache dulu, fallback live scan kalau cache belum pernah terisi.
    const cachedBreakout = await cacheGet<any>(BREAKOUT_CACHE_KEY);
    const breakoutList: any[] = cachedBreakout?.data || (Array.isArray(cachedBreakout) ? cachedBreakout : null) || (await scanBreakouts());
    const crossSignals = cachedBreakout?.crossSignals || (await scanCrossSignals());

    // "Undervalue": proxy RSI oversold MURNI (rsi < 30) - definisi yang sama persis
    // dipakai fitur RSI Oversold sebelum diperlonggar jadi ranking (lihat market-summary.service.ts),
    // bukan metrik baru.
    const undervalueList = (summary.topRsiOversold || []).filter((s: any) => s.rsi < 30);

    // "Akumulasi Asing Berkelanjutan" (2026-08-01, gantikan "Momentum Mingguan" -
    // proxy harga saja, kurang berguna sebagai sinyal berbeda dari Top Gainer) - saham
    // dengan streak >=3 hari netValue positif (volume x arah harga), lihat
    // modules/market/service/foreign-flow-proxy.ts. Sudah dihitung di getMarketSummary().
    const foreignAccumulationList = summary.topForeignAccumulation || [];

    const category = (items: any[], mapDetail: (x: any) => any) => ({
      count: items.length,
      items: items.slice(0, 5).map((s: any) => (s.symbol || '').replace('.JK', '')),
      detail: items.slice(0, DETAIL_CAP).map(mapDetail),
    });

    return NextResponse.json({
      attractive: category(summary.topTechnical, (s: any) => ({ symbol: s.symbol, price: s.price, changePct: s.changePct, metric: `Skor ${s.score}` })),
      risky: category(summary.topTechnicalBearish, (s: any) => ({ symbol: s.symbol, price: s.price, changePct: s.changePct, metric: `Skor ${s.score}` })),
      undervalue: category(undervalueList, (s: any) => ({ symbol: s.symbol, price: s.price, changePct: s.changePct, metric: `RSI ${s.rsi}` })),
      breakout: {
        count: breakoutList.length,
        items: breakoutList.slice(0, 5).map((b: any) => b.symbol.replace('.JK', '')),
        detail: breakoutList.slice(0, DETAIL_CAP).map((b: any) => ({ symbol: b.symbol.replace('.JK', ''), price: b.price, changePct: parseFloat(b.change), metric: `Skor ${b.score} • RR ${b.rr}` })),
      },
      goldenCross: category(crossSignals.golden, (s: any) => ({ symbol: s.symbol.replace('.JK', ''), price: s.price, changePct: parseFloat(s.change), metric: 'Golden Cross' })),
      deadCross: category(crossSignals.dead, (s: any) => ({ symbol: s.symbol.replace('.JK', ''), price: s.price, changePct: parseFloat(s.change), metric: 'Dead Cross' })),
      foreignAccumulation: category(foreignAccumulationList, (s: any) => ({ symbol: s.symbol, price: s.price, changePct: s.changePct, metric: `${s.streak} hari akumulasi` })),
      timestamp: summary.timestamp,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
