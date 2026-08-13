import { guard } from '@/lib/sahamLensGuard';
guard();

import { NextResponse } from 'next/server';
import { normalizeIdxTickerParam } from '@/shared/market/ticker-validation';
import { getMarketAwareCacheHeaders, getMarketAwareTtlSec } from '@/shared/cache/ttl-policy';
import { classifyFreshness } from '@/shared/http/freshness';


function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker: rawTicker } = await params;
  const normalizedTicker = normalizeIdxTickerParam(rawTicker, { allowMarketIndex: true });
  if (!normalizedTicker) return NextResponse.json({ error: 'Ticker tidak valid' }, { status: 400 });
  const ticker = normalizedTicker;

  try {
    // Primary Data Source: Yahoo Finance v8
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`;
    const yahooRes = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      next: { revalidate: getMarketAwareTtlSec() }
    });

    if (yahooRes.ok) {
      const data = await yahooRes.json();
      const meta = data?.chart?.result?.[0]?.meta;
      const lastPrice = meta?.regularMarketPrice;
      // Data invalid (harga hilang/nol/negatif) - jangan diteruskan sebagai kalau valid,
      // jatuh ke blok "data tidak tersedia" di bawah alih-alih membalas harga 0.
      if (isFinitePositive(lastPrice)) {
        const previousClose = isFinitePositive(meta?.previousClose)
          ? meta.previousClose
          : isFinitePositive(meta?.chartPreviousClose)
          ? meta.chartPreviousClose
          : null;
        const changePercent = previousClose != null ? ((lastPrice - previousClose) / previousClose) * 100 : null;
        const volume = isFiniteNonNegative(meta?.regularMarketVolume) ? meta.regularMarketVolume : null;
        // BUG FIX (audit integritas data 2026-08-03, temuan M-07): `lastUpdate`
        // SEBELUMNYA adalah `Date.now()` (waktu SERVER merespons), bukan waktu bar harga
        // sesungguhnya - selisihnya bisa berhari-hari saat akhir pekan/libur bursa tapi
        // selalu tampil "baru saja". `delay: '15m'` juga klaim tetap yang tidak pernah
        // diverifikasi. Sekarang dihitung dari `meta.regularMarketTime` (timestamp bar
        // sesungguhnya dari Yahoo) - lihat shared/http/freshness.ts.
        const fresh = classifyFreshness(meta?.regularMarketTime);

        return NextResponse.json({
          price: lastPrice,
          changePercent: changePercent != null ? parseFloat(changePercent.toFixed(2)) : null,
          // `previousClose` ikut dikirim supaya pemanggil bisa menghitung perubahan POIN
          // secara eksak. Sebelumnya Dashboard menurunkannya sendiri dengan
          // `price * changePercent / 100` - itu keliru dua kali: penyebutnya harga
          // SEKARANG (seharusnya penutupan sebelumnya), dan `changePercent` yang dipakai
          // sudah dibulatkan ke 2 desimal di sini. Terukur pada IHSG: menampilkan +30,9
          // padahal selisih sesungguhnya +30,5.
          previousClose: previousClose,
          volume: volume,
          lastUpdate: fresh.dataTimestamp,
          dataTimestamp: fresh.dataTimestamp,
          ageSeconds: fresh.ageSeconds,
          freshness: fresh.freshness,
          source: 'Yahoo Finance',
          delay: null
        }, { headers: getMarketAwareCacheHeaders() });
      }
      console.warn(`Yahoo Finance returned no valid price for ${ticker}`);
    } else if (yahooRes.status === 429 || yahooRes.status === 403) {
      console.warn(`Yahoo Finance blocked (Status ${yahooRes.status}) for ${ticker}`);
    } else {
      console.warn(`Yahoo Finance error: ${yahooRes.statusText}`);
    }
  } catch (e) {
    console.error('Failed to fetch from Yahoo Finance:', e);
  }

  // Data TIDAK TERSEDIA - sebelumnya di sini ada fallback "mockPrice = 10000" yang
  // dikembalikan sebagai HARGA SUNGGUHAN (HTTP 200, source palsu "api.goapi.io (Mock)")
  // untuk ticker apa pun saat Yahoo di-rate-limit/blokir. Ditemukan saat audit integritas
  // data 2026-08-03 - persis pola `price || 1000` yang dilarang eksplisit. Sekarang gagal
  // secara jujur (503 + price: null) - pemanggil (Risk Calculator, Beranda, dst.) semua
  // sudah punya jalur catch/null dan menampilkan "N/A", bukan angka karangan.
  return NextResponse.json({
    price: null,
    changePercent: null,
    volume: null,
    lastUpdate: null,
    dataTimestamp: null,
    ageSeconds: null,
    freshness: 'UNKNOWN',
    source: null,
    delay: null,
    error: 'Data harga tidak tersedia saat ini',
  }, { status: 503 });
}
