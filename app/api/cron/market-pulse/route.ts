import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
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
const CACHE_KEY = 'sahamlens:cache:computed:market-pulse';

export async function POST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const rawBody = await req.text();

  const isValid = await verifyQStashSignature(signature, rawBody);
  if (!isValid) {
    logger.warn('Menolak request /api/cron/market-pulse - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await withJobRunLog('market-pulse', async () => {
      const data = await getMarketPulse();
      await cacheSet(CACHE_KEY, data, TTL.MARKET);
      return { indices: data.indices?.length ?? 0, sectors: data.sectorHeatmap?.length ?? 0 };
    });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job market-pulse gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}
