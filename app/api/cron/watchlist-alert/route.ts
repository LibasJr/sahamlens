import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { logger } from '@/shared/logger/logger';
import { checkAndTriggerAlerts } from '@/modules/notification';

// BUILD 006 (Scheduler) - lihat catatan pola di app/api/cron/macro/route.ts.
// Logika evaluasi alert (checkAndTriggerAlerts) SUDAH ADA sejak BUILD 002 lewat
// app/api/alerts/check (GET, TANPA verifikasi signature apapun) - endpoint itu
// SENGAJA DIBIARKAN apa adanya (tidak tahu apakah ada pemicu eksternal yang sudah
// bergantung padanya), dan job baru ini ditambahkan sebagai jalur QStash yang
// benar-benar terverifikasi untuk didaftarkan sebagai schedule resmi.
export async function POST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const rawBody = await req.text();

  const isValid = await verifyQStashSignature(signature, rawBody);
  if (!isValid) {
    logger.warn('Menolak request /api/cron/watchlist-alert - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const origin = new URL(req.url).origin;

  try {
    const result = await withJobRunLog('watchlist-alert', () => checkAndTriggerAlerts(origin));
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job watchlist-alert gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}
