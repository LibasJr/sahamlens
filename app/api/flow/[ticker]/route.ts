import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { getSession, checkProAccessLive } from '@/modules/user';
import { computeDailyNetFlow, computeAccumulationStreak, analyzeBandarmology } from '@/modules/market';

// REWRITE TOTAL (2026-08-01) - versi sebelumnya (BUILD 003) menghasilkan SEMUA angka
// (foreignFlow20D, nama broker, volume beli/jual, status AKUMULASI/DISTRIBUSI) dari
// seedRandom(ticker) murni, angka acak yang selalu sama untuk ticker yang sama, TIDAK
// PERNAH benar-benar mencerminkan pasar - ditemukan saat audit, dipakai fitur Pro
// berbayar. Sekarang dihitung dari histori harga+volume Yahoo Finance yang real, lewat
// modules/market/service/foreign-flow-proxy.ts (dipakai bareng kategori "Akumulasi
// Asing Berkelanjutan" di AI Pick). "Top Broker" DIHAPUS (bukan diganti versi jujur) -
// IDX tidak menyediakan feed broker summary gratis, jadi tidak ada cara menghitungnya
// dari data real yang tersedia.

export async function GET(
  request: Request,
  { params }: { params: { ticker: string } }
) {
  // BUILD 003 (API Standard) - fitur ini Pro-only di UI, endpoint-nya sendiri harus
  // ikut digerbang supaya paywall tidak gampang dilewati dengan memanggil API langsung.
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Belum login' }, { status: 401 });
  }
  if (!(await checkProAccessLive(session))) {
    return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
  }

  const cleanTicker = params.ticker.toUpperCase().replace('.JK', '');
  const ticker = `${cleanTicker}.JK`;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=2mo&interval=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error('Gagal mengambil data Yahoo Finance');

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error('Data tidak ditemukan');

    const timestamps: number[] = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};

    const history: { date: string; high: number; low: number; close: number; volume: number }[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quote.close?.[i] != null) {
        history.push({
          date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
          high: quote.high?.[i] ?? quote.close[i],
          low: quote.low?.[i] ?? quote.close[i],
          close: quote.close[i],
          volume: quote.volume?.[i] || 0,
        });
      }
    }

    if (history.length < 6) {
      return NextResponse.json({ error: 'Histori harga tidak cukup untuk menghitung arus dana' }, { status: 404 });
    }

    const dailyFlow = computeDailyNetFlow(history).slice(-20);
    const last3 = dailyFlow.slice(-3);
    const isAccumulation3D = last3.length === 3 && last3.every((d) => d.netValueBillion > 0);
    const isDistribution3D = last3.length === 3 && last3.every((d) => d.netValueBillion < 0);
    const net5D = parseFloat(dailyFlow.slice(-5).reduce((sum, d) => sum + d.netValueBillion, 0).toFixed(2));
    const streak = computeAccumulationStreak(dailyFlow);

    const upDays = dailyFlow.filter((d) => d.netValueBillion > 0);
    const downDays = dailyFlow.filter((d) => d.netValueBillion < 0);
    const avgUpValueBillion = upDays.length ? parseFloat((upDays.reduce((s, d) => s + d.netValueBillion, 0) / upDays.length).toFixed(2)) : 0;
    const avgDownValueBillion = downDays.length ? parseFloat((downDays.reduce((s, d) => s + Math.abs(d.netValueBillion), 0) / downDays.length).toFixed(2)) : 0;

    let status: 'AKUMULASI' | 'DISTRIBUSI' | 'NETRAL' = 'NETRAL';
    if (isAccumulation3D) status = 'AKUMULASI';
    else if (isDistribution3D) status = 'DISTRIBUSI';

    const bandarmology = analyzeBandarmology(history.slice(-20));

    return NextResponse.json({
      ticker,
      foreignFlow20D: dailyFlow,
      summary: {
        status,
        net5D,
        streak,
        isAccumulation3D,
        isDistribution3D,
        upDays20D: upDays.length,
        downDays20D: downDays.length,
        avgUpValueBillion,
        avgDownValueBillion,
        cmf20: bandarmology.cmf20,
        netPressurePct: bandarmology.netPressurePct,
      },
    });
  } catch (error: any) {
    console.error('Flow API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
