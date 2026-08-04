import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { logger } from '@/shared/logger/logger';
import { getMarketSummary } from '@/modules/market';
import { cacheSet } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC as TTL } from '@/shared/cache/ttl-policy';

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
// simpan ke Redis, GET /api/market-summary tinggal baca cache. TTL MARKET_SUMMARY
// diperpanjang dari 2 -> 6 menit (shared/cache/ttl-policy.ts) supaya sinkron dengan
// interval cron 5 menit ini + buffer keterlambatan run, sama seperti pola MARKET.
const CACHE_KEY = 'sahamlens:cache:computed:market-summary';

export async function POST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const rawBody = await req.text();

  const isValid = await verifyQStashSignature(signature, rawBody);
  if (!isValid) {
    logger.warn('Menolak request /api/cron/market-summary - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await withJobRunLog('market-summary', async () => {
      const data = await getMarketSummary();
      await cacheSet(CACHE_KEY, data, TTL.MARKET_SUMMARY);
      return { topGainers: data.topGainers?.length ?? 0, topVolume: data.topVolume?.length ?? 0 };
    });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job market-summary gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}
