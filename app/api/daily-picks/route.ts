import { NextResponse } from 'next/server';
import { getMarketSummary } from '@/modules/market';
import { scanBreakouts } from '@/modules/recommendation';
import { getOrCompute, cacheGet } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';

// Publik (tanpa login) - dipakai widget "Hari Ini AI Menemukan" di halaman utama (Dashboard.tsx)
// untuk menarik pengunjung buka aplikasi tiap hari SEBELUM signup. Semua angka di sini
// dihitung ulang dari data real yang SUDAH dipakai fitur lain (bukan metrik baru yang
// dikarang) - lihat komentar per kategori di bawah.
export const dynamic = 'force-dynamic';

const MARKET_SUMMARY_CACHE_KEY = 'sahamlens:cache:computed:market-summary';
const BREAKOUT_CACHE_KEY = 'sahamlens:cache:computed:breakout-radar';

export async function GET() {
  try {
    // Reuse cache key yang sama dengan /api/market-summary supaya tidak scan ulang
    // 50 saham dua kali (cache-nya sudah dipenuhi request landing page yang sama).
    const summary = await getOrCompute(MARKET_SUMMARY_CACHE_KEY, CACHE_TTL_SEC.MARKET_SUMMARY, getMarketSummary);

    // Breakout radar di-refresh cron tiap 5 menit (app/api/cron/breakout-scan) - baca
    // cache dulu, fallback live scan kalau cache belum pernah terisi.
    const cachedBreakout = await cacheGet<any>(BREAKOUT_CACHE_KEY);
    const breakoutList: any[] = cachedBreakout?.data || cachedBreakout || (await scanBreakouts());

    // "Undervalue": proxy RSI oversold MURNI (rsi < 30) - definisi yang sama persis
    // dipakai fitur RSI Oversold sebelum diperlonggar jadi ranking (lihat market-summary.service.ts),
    // bukan metrik baru.
    const undervalueList = (summary.topRsiOversold || []).filter((s: any) => s.rsi < 30);

    return NextResponse.json({
      attractive: { count: summary.topTechnical.length, items: summary.topTechnical.slice(0, 5).map((s: any) => s.symbol) },
      risky: { count: summary.topTechnicalBearish.length, items: summary.topTechnicalBearish.slice(0, 5).map((s: any) => s.symbol) },
      undervalue: { count: undervalueList.length, items: undervalueList.slice(0, 5).map((s: any) => s.symbol) },
      breakout: { count: breakoutList.length, items: breakoutList.slice(0, 5).map((b: any) => b.symbol) },
      timestamp: summary.timestamp,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
