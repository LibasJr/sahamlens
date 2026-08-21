import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { logger } from '@/shared/logger/logger';
import { scanBreakouts, scanCrossSignals } from '@/modules/recommendation';
import { cacheSet } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC as TTL } from '@/shared/cache/ttl-policy';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';

// BUILD 006 (Scheduler) - lihat catatan pola di app/api/cron/macro/route.ts.
// GET /api/breakout-radar sebelumnya menjalankan scanBreakouts() (fetch Yahoo untuk
// 15 simbol watchlist) di SETIAP request pengguna tanpa cache sama sekali - job ini
// memindahkan komputasi itu ke jadwal, hasil ditaruh di Redis untuk dibaca cache-first.
const CACHE_KEY = 'sahamlens:cache:computed:breakout-radar';

async function handlePOST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const authorization = req.headers.get('authorization');
  const rawBody = await req.text();

  const isValid = await verifyQStashSignature(signature, rawBody, authorization);
  if (!isValid) {
    logger.warn('Menolak request /api/cron/breakout-scan - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const guarded = await runWithJobConcurrencyGuard('breakout-scan', () => withJobRunLog('breakout-scan', async () => {
      const data = await scanBreakouts();
      const crossSignals = await scanCrossSignals();
      const payload = { data, crossSignals, lastUpdate: new Date().toISOString() };
      // TTL.BREAKOUT_RADAR (3 hari), bukan TTL.MARKET (60 detik saat bursa buka - itu
      // acuan untuk PEMBACA live-fallback, bukan penulis cron) - lihat komentar di
      // shared/cache/ttl-policy.ts untuk kenapa route ini butuh TTL jauh lebih panjang
      // dari cron intervalnya sendiri (tidak ada fallback live-scan di pemanggil).
      await cacheSet(CACHE_KEY, payload, TTL.BREAKOUT_RADAR);
      return { scanned: data.length };
    }));
    if (!guarded.executed) {
      return NextResponse.json({ success: true, skipped: true, reason: guarded.reason }, { status: 202 });
    }
    const result = guarded.value;
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job breakout-scan gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return runCronRoute(req, () => handlePOST(req));
}
