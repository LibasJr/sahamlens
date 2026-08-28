import { NextRequest, NextResponse } from 'next/server';
import { fetchCorporateCalendar } from '@/modules/market/service/corporate-calendar.service';
import { cacheSet } from '@/shared/cache/redis-cache';
import { CACHE_TTL_SEC as TTL } from '@/shared/cache/ttl-policy';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { logger } from '@/shared/logger/logger';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';
import { timingSafeStringEqual } from '@/shared/security/timing-safe-equal';

export const maxDuration = 120;

// BARU (2026-08-14, laporan pengguna: menu terkait cron harus punya cache biar tidak
// lambat). Sama seperti screener-scan (lihat catatan di sana) - /api/calendar murni
// getOrCompute() TTL 6 jam TANPA cron warmer, jadi pengunjung pertama tiap 6 jam
// menanggung fetchCorporateCalendar() live. GET + CRON_SECRET (pola systemd, QStash
// sudah penuh 10/10) - lihat instruksi timer di docs/operations/DEPLOYMENT.md.
async function runScan() {
  const events = await fetchCorporateCalendar();
  await cacheSet(COMPUTED_CACHE_KEY.CORPORATE_CALENDAR, events, TTL.CORPORATE_CALENDAR);
  return { count: events.length };
}

async function handleGET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !timingSafeStringEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const guarded = await runWithJobConcurrencyGuard('calendar-scan', () =>
      withJobRunLog('calendar-scan', runScan),
    );
    if (!guarded.executed) return NextResponse.json({ success: true, skipped: true, reason: guarded.reason }, { status: 202 });
    return NextResponse.json({ success: true, result: guarded.value });
  } catch (error) {
    logger.error('Job calendar-scan gagal', { err: error });
    return NextResponse.json({ error: 'Job calendar-scan gagal' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return runCronRoute(req, () => handleGET(req));
}
