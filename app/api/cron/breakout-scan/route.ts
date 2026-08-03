import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { logger } from '@/shared/logger/logger';
import { scanBreakouts, scanCrossSignals } from '@/modules/recommendation';
import { cacheSet } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC as TTL } from '@/shared/cache/ttl-policy';

// BUILD 006 (Scheduler) - lihat catatan pola di app/api/cron/macro/route.ts.
// GET /api/breakout-radar sebelumnya menjalankan scanBreakouts() (fetch Yahoo untuk
// 15 simbol watchlist) di SETIAP request pengguna tanpa cache sama sekali - job ini
// memindahkan komputasi itu ke jadwal, hasil ditaruh di Redis untuk dibaca cache-first.
const CACHE_KEY = 'sahamlens:cache:computed:breakout-radar';

export async function POST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const rawBody = await req.text();

  const isValid = await verifyQStashSignature(signature, rawBody);
  if (!isValid) {
    logger.warn('Menolak request /api/cron/breakout-scan - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await withJobRunLog('breakout-scan', async () => {
      const [data, crossSignals] = await Promise.all([scanBreakouts(), scanCrossSignals()]);
      const payload = { data, crossSignals, lastUpdate: new Date().toISOString() };
      // TTL.BREAKOUT_RADAR (3 hari), bukan TTL.MARKET (6 menit) - lihat komentar di
      // shared/cache/ttl-policy.ts untuk kenapa route ini butuh TTL jauh lebih panjang
      // dari cron intervalnya sendiri (tidak ada fallback live-scan di pemanggil).
      await cacheSet(CACHE_KEY, payload, TTL.BREAKOUT_RADAR);
      return { scanned: data.length };
    });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job breakout-scan gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}
