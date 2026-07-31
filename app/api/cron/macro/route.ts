import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { logger } from '@/shared/logger/logger';
import { refreshUsdIdr } from '@/modules/macro';

// Proof-of-concept Fase 1 Scheduler Architecture: pola Cron -> Worker LANGSUNG
// (tanpa queue/fan-out) - job global paling sederhana, dipilih karena risikonya
// paling rendah untuk membuktikan pola signature-verification + job_run_log
// sebelum dipakai job yang lebih mahal/berisiko (AI Scan, Watchlist Alert).
//
// Endpoint ini TIDAK dipanggil browser - dipicu QStash Schedule (belum didaftarkan
// live, lihat catatan roadmap) yang mengirim POST bertanda tangan ke sini.
export async function POST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const rawBody = await req.text();

  const isValid = await verifyQStashSignature(signature, rawBody);
  if (!isValid) {
    logger.warn('Menolak request /api/cron/macro - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await withJobRunLog('macro', refreshUsdIdr);
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job macro gagal', { err });
    return NextResponse.json({ error: 'Job gagal' }, { status: 500 });
  }
}
