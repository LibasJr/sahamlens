import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { logger } from '@/shared/logger/logger';
import { getMarketSummary } from '@/modules/market';
import { cacheSet } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC as TTL } from '@/shared/cache/ttl-policy';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';

// Optimasi loading 2026-08-05: /api/market-summary (dipakai landing page `/` dan `/home`,
// halaman paling ramai di aplikasi ini - TANPA login) sebelumnya TIDAK PUNYA cron warmer
// sama sekali, berbeda dari market-pulse/breakout-scan/ai-pick-scan yang semuanya sudah
// dijadwalkan. Ia murni `getOrCompute()` on-demand dengan TTL 2 menit - jadi tiap 2 menit,
// PENGUNJUNG PERTAMA yang membuka landing page menanggung scan LIVE 250 saham (10 batch
// sekuensial x 25 paralel ke Yahoo Finance), bisa berumur beberapa detik. Karena ini
// halaman yang paling sering dibuka, giliran kena "request pertama setelah cache expired"
// juga paling sering terjadi - salah satu penyebab utama keluhan "semua halaman lemot".
//
// Pola sama persis dengan app/api/cron/market-pulse/route.ts: hitung ulang di jadwal,
// simpan ke Redis, GET /api/market-summary tinggal baca cache.
//
// BUG FIX (2026-08-14): route ini SEBELUMNYA menulis dengan TTL.MARKET_SUMMARY (60 detik
// saat bursa buka - konstanta yang dimaksudkan untuk PEMBACA live-fallback, bukan
// penulis cron) walau komentar di atas sudah lama mengklaim "diperpanjang ke 6 menit" -
// klaimnya benar sebagai NIAT, tapi tidak lagi cocok dengan getter yang sebenarnya
// dipakai. Sekarang MARKET_SUMMARY_CRON (shared/cache/ttl-policy.ts) - konstanta
// terpisah yang benar-benar 6 menit, dipakai KHUSUS di sini.
const CACHE_KEY = COMPUTED_CACHE_KEY.MARKET_SUMMARY;

async function handlePOST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const authorization = req.headers.get('authorization');
  const rawBody = await req.text();

  const isValid = await verifyQStashSignature(signature, rawBody, authorization);
  if (!isValid) {
    logger.warn('Menolak request /api/cron/market-summary - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await withJobRunLog('market-summary', async () => {
      const data = await getMarketSummary();
      await cacheSet(CACHE_KEY, data, TTL.MARKET_SUMMARY_CRON);
      return { topGainers: data.topGainers?.length ?? 0, topVolume: data.topVolume?.length ?? 0 };
    });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job market-summary gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return runCronRoute(req, () => handlePOST(req));
}
