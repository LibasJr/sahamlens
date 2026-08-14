import { NextRequest, NextResponse } from 'next/server';
import { fetchScreenerUniverse } from '@/modules/market/service/screener.service';
import { cacheSet } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC as TTL } from '@/shared/cache/ttl-policy';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { logger } from '@/shared/logger/logger';

export const maxDuration = 120;

// BARU (2026-08-14, laporan pengguna: "buka LensScanner lama sekali muncul nya"). Sebelum
// ini, /api/screener (app/api/screener/route.ts) murni getOrCompute() on-demand dengan TTL
// 30 menit dan TIDAK PERNAH punya cron warmer - persis pola bug yang sama dengan
// market-summary sebelum diperbaiki (lihat catatan panjang di
// app/api/cron/market-summary/route.ts): pengunjung PERTAMA yang membuka /screener setelah
// cache 30-menit kadaluarsa menanggung fetchScreenerUniverse() LIVE (fundamental + histori
// 1 tahun untuk ~50 saham kurasi, lihat komentar maxDuration=60 di app/api/screener/route.ts)
// di request-nya sendiri.
//
// QStash sudah penuh 10/10 job (lihat config/scheduled-jobs.json & DEPLOYMENT.md) - job ini
// SENGAJA cuma punya handler GET + CRON_SECRET (pola systemd timer, sama seperti
// lens-bucket-backtest/lens-score-optimizer/broker-summary-scan), BUKAN POST+signature
// QStash. Perlu timer systemd baru di VPS - lihat instruksi di DEPLOYMENT.md.
async function runScan() {
  const universe = await fetchScreenerUniverse();
  await cacheSet(COMPUTED_CACHE_KEY.SCREENER_UNIVERSE, universe, TTL.SCREENER_UNIVERSE);
  return { count: universe.length };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const guarded = await runWithJobConcurrencyGuard('screener-scan', () =>
      withJobRunLog('screener-scan', runScan),
    );
    if (!guarded.executed) return NextResponse.json({ success: true, skipped: true, reason: guarded.reason }, { status: 202 });
    return NextResponse.json({ success: true, result: guarded.value });
  } catch (error) {
    logger.error('Job screener-scan gagal', { error });
    return NextResponse.json({ error: 'Job screener-scan gagal' }, { status: 500 });
  }
}
