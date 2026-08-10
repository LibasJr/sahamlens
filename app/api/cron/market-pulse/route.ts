import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { logger } from '@/shared/logger/logger';
import { getMarketPulse } from '@/modules/market';
import { cacheSet } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC as TTL } from '@/shared/cache/ttl-policy';

// BUILD 006 (Scheduler) - pola sama persis dengan app/api/cron/macro/route.ts
// (Cron -> Worker langsung, verifikasi signature QStash, dibungkus job_run_log).
// Menghitung ulang Market Pulse (IHSG/LQ45/sektor/breadth - +-50 simbol Yahoo per
// run) di jadwal, BUKAN di setiap request pengguna, lalu menaruh hasilnya di Redis
// supaya GET /api/market-pulse pengguna tinggal baca cache (lihat perubahan di
// route itu) - sebelumnya endpoint itu TIDAK PERNAH di-cache sama sekali, setiap
// pemuatan halaman = ~50 fetch Yahoo baru.
const CACHE_KEY = 'sahamlens:cache:computed:market-pulse:v2';

export async function POST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const rawBody = await req.text();

  const isValid = await verifyQStashSignature(signature, rawBody);
  if (!isValid) {
    logger.warn('Menolak request /api/cron/market-pulse - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const guarded = await runWithJobConcurrencyGuard('market-pulse', () => withJobRunLog('market-pulse', async () => {
      const data = await getMarketPulse();
      await cacheSet(CACHE_KEY, data, TTL.MARKET);
      return { indices: data.indices?.length ?? 0, sectors: data.sectorHeatmap?.length ?? 0 };
    }));
    if (!guarded.executed) {
      return NextResponse.json({ success: true, skipped: true, reason: guarded.reason }, { status: 202 });
    }
    const result = guarded.value;
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job market-pulse gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}
