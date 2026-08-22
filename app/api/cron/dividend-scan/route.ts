import { NextRequest, NextResponse } from 'next/server';
import { fetchDividendUniverse } from '@/modules/fundamental';
import { cacheSet } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC as TTL } from '@/shared/cache/ttl-policy';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { logger } from '@/shared/logger/logger';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';

export const maxDuration = 120;

// BARU (2026-08-14, laporan pengguna: menu terkait cron harus punya cache biar tidak
// lambat). Sama seperti screener-scan (lihat catatan di sana) - /api/dividend-plan murni
// getOrCompute() TTL 30 menit TANPA cron warmer. GET + CRON_SECRET (pola systemd, QStash
// sudah penuh 10/10) - lihat instruksi timer di docs/operations/DEPLOYMENT.md. Cuma universe yang
// di-cache di sini (fetchDividendUniverse) - buildDividendPlan (kalkulasi per modal/
// target pengguna) tetap dihitung on-demand per request, murah & spesifik-user.
async function runScan() {
  const universe = await fetchDividendUniverse();
  await cacheSet(COMPUTED_CACHE_KEY.DIVIDEND_UNIVERSE, universe, TTL.DIVIDEND_UNIVERSE);
  return { count: universe.length };
}

async function handleGET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const guarded = await runWithJobConcurrencyGuard('dividend-scan', () =>
      withJobRunLog('dividend-scan', runScan),
    );
    if (!guarded.executed) return NextResponse.json({ success: true, skipped: true, reason: guarded.reason }, { status: 202 });
    return NextResponse.json({ success: true, result: guarded.value });
  } catch (error) {
    logger.error('Job dividend-scan gagal', { err: error });
    return NextResponse.json({ error: 'Job dividend-scan gagal' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return runCronRoute(req, () => handleGET(req));
}
