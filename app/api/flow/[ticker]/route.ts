import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { checkPublicComputeBudget, rateLimitExceeded } from '@/shared/security/api-rate-limit';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';
import { getMarketAwareTtlSec } from '@/shared/cache/ttl-policy';
import { getSession, hasOpenOrProAccess } from '@/modules/user';
import {
  computeDailyNetFlow,
  computeAccumulationStreak,
  analyzeBandarmology,
  analyzeAccumulationSignal,
  getRealForeignFlow,
  summarizeForeignFlow,
  IDX_FOREIGN_FLOW_SOURCE,
} from '@/modules/market';

// SUMBER DATA (2026-08-18): Net Foreign Buy/Sell RESMI Bursa Efek Indonesia jadi sumber
// UTAMA. Angkanya berasal dari endpoint publik BEI ListedCompany/GetTradingInfoSS yang
// disinkronkan ke data/foreign-flow/{TICKER}.json oleh scripts/sync-idx-foreign-flow.py
// (Node tidak bisa memanggil idx.co.id langsung - Cloudflare menolak klien tanpa
// fingerprint TLS browser, 403; skrip Python memakai curl_cffi impersonate chrome124).
//
// FALLBACK: emiten yang artefak resminya belum tersinkron TETAP dilayani proxy Chaikin
// Money Flow dari histori harga+volume Yahoo (modules/market/service/foreign-flow-proxy.ts)
// - dua-duanya angka riil, tapi mengukur hal BERBEDA: yang resmi adalah lembar saham yang
// benar-benar ditransaksikan investor asing menurut Bursa, yang proxy hanya menyimpulkan
// tekanan beli/jual dari posisi close dalam range harian. Karena itu setiap respons
// membawa field `source` dan UI wajib melabeli keduanya berbeda - jangan pernah
// menyeragamkan labelnya seolah satu jenis data.
//
// Riwayat: versi BUILD 003 menghasilkan SEMUA angka di sini dari seedRandom(ticker)
// (acak, tapi stabil per ticker sehingga tampak seperti data). Itu sudah dihapus total
// 2026-08-01. Jangan pernah mengembalikan angka yang tidak berasal dari sumber nyata.

// Tidak di-export: Next.js melarang route file mengekspor apa pun selain handler HTTP
// dan segment config (validator .next/types menolaknya saat typecheck).
const FALLBACK_FLOW_SOURCE = 'YAHOO_CMF_PROXY' as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const budget = await checkPublicComputeBudget(request.headers, 'flow');
  if (!budget.allowed) return rateLimitExceeded(budget);
  // Tamu (session null) dapat akses PENUH tanpa perlu login - keputusan produk
  // 2026-08-13, lihat hasOpenOrProAccess(). Akun terdaftar tetap lewat gerbang
  // trial/Pro seperti sebelumnya.
  const session = await getSession();
  if (!(await hasOpenOrProAccess(session))) {
    return NextResponse.json({ error: 'Fitur ini butuh akun Pro', code: 'SUBSCRIPTION_REQUIRED' }, { status: 402 });
  }

  const { ticker: rawTicker } = await params;
  const ticker = normalizeIdxTickerParam(rawTicker);
  if (!ticker) return NextResponse.json({ error: 'Ticker tidak valid' }, { status: 400 });
  const cleanTicker = ticker.replace('.JK', '');

  // ---------------------------------------------------------------------------
  // JALUR 1 - Data resmi BEI (utama)
  // ---------------------------------------------------------------------------
  const official = getRealForeignFlow(cleanTicker, 20);
  if (official && official.history.length > 0) {
    const summary = summarizeForeignFlow(official.history);
    return NextResponse.json({
      ticker: cleanTicker,
      source: IDX_FOREIGN_FLOW_SOURCE,
      updatedAt: official.updatedAt,
      summary,
      foreignFlow20D: official.history.map((point) => ({
        date: point.date,
        close: point.close,
        volume: point.volume,
        foreignBuy: point.foreignBuy,
        foreignSell: point.foreignSell,
        netForeignVolume: point.netForeignVolume,
        netForeignValueBillion: point.netForeignValueBillion,
        // Alias supaya komponen grafik memakai satu nama field untuk kedua sumber.
        netValueBillion: point.netForeignValueBillion,
      })),
    });
  }

  // ---------------------------------------------------------------------------
  // JALUR 2 - Fallback proxy CMF dari histori harga+volume Yahoo
  // ---------------------------------------------------------------------------
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=2mo&interval=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      next: { revalidate: getMarketAwareTtlSec() },
    });
    if (!res.ok) throw new Error('Gagal mengambil data Yahoo Finance');

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error('Data tidak ditemukan');

    const timestamps: number[] = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};

    const history: { date: string; high: number; low: number; close: number; volume: number }[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const timestamp = timestamps[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      const close = quote.close?.[i];
      const volume = quote.volume?.[i];

      if (
        isFiniteNumber(timestamp) &&
        isFiniteNumber(high) &&
        isFiniteNumber(low) &&
        isFiniteNumber(close) &&
        isFiniteNumber(volume) &&
        close > 0 &&
        high >= low &&
        volume >= 0
      ) {
        history.push({
          date: new Date(timestamp * 1000).toISOString().split('T')[0],
          high,
          low,
          close,
          volume,
        });
      }
    }

    if (history.length < 6) {
      return NextResponse.json({ error: 'Histori harga tidak cukup untuk menghitung arus dana' }, { status: 404 });
    }

    const dailyFlow = computeDailyNetFlow(history).slice(-20);
    const closeByDate = new Map(history.map((h) => [h.date, h.close]));
    const net5D = parseFloat(dailyFlow.slice(-5).reduce((sum, d) => sum + d.netValueBillion, 0).toFixed(2));
    const streak = computeAccumulationStreak(dailyFlow);

    const upDays = dailyFlow.filter((d) => d.netValueBillion > 0);
    const downDays = dailyFlow.filter((d) => d.netValueBillion < 0);
    const avgUpValueBillion = upDays.length ? parseFloat((upDays.reduce((s, d) => s + d.netValueBillion, 0) / upDays.length).toFixed(2)) : null;
    const avgDownValueBillion = downDays.length ? parseFloat((downDays.reduce((s, d) => s + Math.abs(d.netValueBillion), 0) / downDays.length).toFixed(2)) : null;

    // Dulu status AKUMULASI/DISTRIBUSI cuma dari "3 hari netValue positif berturut-turut"
    // - gampang lolos meski sinyalnya lemah (positif tipis-tipis). Diganti konfirmasi
    // 4-lapis (CMF20 + CLV kuat 3 hari + volume spike + tren MFM menguat) - harus lolos
    // SEMUA baru diklaim "KONSISTEN", bukan cuma 1 syarat lemah.
    const accumulation = analyzeAccumulationSignal(history.slice(-20));
    const isAccumulation3D = accumulation.status === 'AKUMULASI';
    const isDistribution3D = accumulation.status === 'DISTRIBUSI';
    const status = accumulation.status;

    const bandarmology = analyzeBandarmology(history.slice(-20));

    return NextResponse.json({
      ticker,
      source: FALLBACK_FLOW_SOURCE,
      foreignFlow20D: dailyFlow.map((d) => ({ ...d, close: closeByDate.get(d.date) ?? null })),
      summary: {
        status,
        net5D,
        // Nama yang sama dengan jalur resmi supaya UI tidak perlu dua cabang untuk
        // angka yang artinya sama-sama "akumulasi 5 hari terakhir".
        net5DBillion: net5D,
        streak,
        accumulationStreak: streak,
        isAccumulation3D,
        isDistribution3D,
        upDays20D: upDays.length,
        downDays20D: downDays.length,
        avgUpValueBillion,
        avgDownValueBillion,
        cmf20: bandarmology.cmf20,
        netPressurePct: bandarmology.netPressurePct,
        volRatio: accumulation.volRatio,
      },
    });
  } catch (error: any) {
    console.error('Flow API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
