import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { logger } from '@/shared/logger/logger';
import { checkAndTriggerAlerts } from '@/modules/notification';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';

// BUILD 006 (Scheduler) - lihat catatan pola di app/api/cron/macro/route.ts.
// Logika evaluasi alert (checkAndTriggerAlerts) SUDAH ADA sejak BUILD 002 lewat
// app/api/alerts/check. Route ini adalah jalur TERJADWAL resmi, diverifikasi lewat
// signature QStash. Sejak 2026-08-11 /api/alerts/check tidak lagi terbuka untuk publik:
// pemanggilnya ditelusuri cuma tombol manual di halaman watchlist, jadi endpoint itu
// sekarang mewajibkan sesi login (lihat catatan lengkap di file tersebut).
async function handlePOST(req: NextRequest) {
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

export async function POST(req: NextRequest) {
  return runCronRoute(req, () => handlePOST(req));
}
