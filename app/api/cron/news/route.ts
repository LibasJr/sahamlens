import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { logger } from '@/shared/logger/logger';
import { getMarketNews } from '@/modules/news';
import { cacheSet } from '@/shared/cache/redis-cache';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { CACHE_TTL_SEC } from '@/shared/cache/ttl-policy';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';

// BARU (2026-08-14, pertanyaan pengguna "apa ada cron untuk update news?" - sebelumnya
// TIDAK ADA). Pola SAMA PERSIS dengan app/api/cron/market-summary/route.ts: /api/news
// sebelumnya murni getOrCompute() on-demand dengan TTL 60 detik saat bursa buka, TANPA
// cron warmer - jadi tiap 60 detik pas bursa buka, pengunjung PERTAMA menanggung ~10
// fetch RSS feed + 1 panggilan AI klasifikasi berita (getMarketNews). Job ini
// menghitung ulang di jadwal dan menyimpan ke Redis; GET /api/news tinggal baca cache.
// TTL CACHE_TTL_SEC.MARKET_NEWS (6 menit) disamakan dengan interval cron 5 menit ini +
// buffer 1 run telat.
async function handlePOST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const authorization = req.headers.get('authorization');
  const rawBody = await req.text();

  const isValid = await verifyQStashSignature(signature, rawBody, authorization);
  if (!isValid) {
    logger.warn('Menolak request /api/cron/news - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await withJobRunLog('news', async () => {
      const data = await getMarketNews();
      await cacheSet(COMPUTED_CACHE_KEY.MARKET_NEWS, data, CACHE_TTL_SEC.MARKET_NEWS);
      return { items: data.items.length };
    });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job news gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return runCronRoute(req, () => handlePOST(req));
}
