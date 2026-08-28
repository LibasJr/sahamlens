import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { logger } from '@/shared/logger/logger';
import { checkTriggerAndDispatchAlerts } from '@/modules/notification';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';

// BUILD 006 (Scheduler) - lihat catatan pola di app/api/cron/macro/route.ts.
// Logika evaluasi alert berjalan lewat jalur terjadwal resmi yang diverifikasi QStash.
// Setelah evaluasi, alert yang baru terpicu didispatch ke subscription Web Push user;
// deduplication dilakukan per (alert_id, subscription_id) di database.
async function handlePOST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const authorization = req.headers.get('authorization');
  const rawBody = await req.text();

  const isValid = await verifyQStashSignature(signature, rawBody, authorization);
  if (!isValid) {
    logger.warn('Menolak request /api/cron/watchlist-alert - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const origin = new URL(req.url).origin;

  try {
    const result = await withJobRunLog('watchlist-alert', () => checkTriggerAndDispatchAlerts(origin));
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job watchlist-alert gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return runCronRoute(req, () => handlePOST(req));
}
