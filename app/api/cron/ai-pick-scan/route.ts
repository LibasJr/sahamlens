import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog, recordJobNonRun } from '@/shared/scheduler/job-run-log.repository';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { logger } from '@/shared/logger/logger';
import { scanAiPickScores } from '@/modules/recommendation/service/ai-pick-scan.service';
import { writeAiPickScores } from '@/shared/cache/ai-pick-cache';
import { archiveLensRadarHistory } from '@/modules/lens-radar/service/history-archive.service';
import { getAiPickScanWindow } from '@/shared/calendar/idx-trading-calendar';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';

export const maxDuration = 300;

// Menyiapkan skor siap pakai untuk /api/ai-pick. Inilah yang membuat halaman AI Pick
// berhenti memindai sendiri: pekerjaan yang dulu dilakukan ~22 request per klik di tab
// Rekomendasi sekarang dikerjakan sekali di sini untuk seluruh universe.
async function handlePOST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const rawBody = await req.text();

  if (!(await verifyQStashSignature(signature, rawBody))) {
    logger.warn('Menolak request /api/cron/ai-pick-scan - signature QStash tidak valid');
    // Dicatat, bukan cuma di-log. Penolakan signature (mis. QSTASH_CURRENT_SIGNING_KEY
    // salah/kosong di environment) dulu tidak meninggalkan jejak di database, jadi tidak
    // bisa dibedakan dari "cron ini memang tidak pernah dijadwalkan" - padahal yang satu
    // dibetulkan dengan mengisi env var, yang lain dengan membuat jadwalnya.
    await recordJobNonRun('ai-pick-scan', 'REJECTED', 'Signature QStash tidak valid', {
      hasSignatureHeader: Boolean(signature),
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const scanWindow = getAiPickScanWindow(new Date());
  if (scanWindow === 'CLOSED') {
    logger.info('ai-pick-scan dilewati di luar sesi IDX', { scanWindow });
    // Ikut dicatat supaya panel /admin/jobs bisa membedakan "dipanggil tapi selalu di luar
    // jam bursa" (jadwal QStash-nya salah jam) dari "tidak pernah dipanggil sama sekali".
    await recordJobNonRun('ai-pick-scan', 'SKIPPED', 'Di luar jendela scan IDX', { scanWindow });
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'outside_idx_scan_window',
      scanWindow,
    });
  }

  let stage = 'request:accepted';

  try {
    const guarded = await runWithJobConcurrencyGuard('ai-pick-scan', () => withJobRunLog('ai-pick-scan', async () => {
      stage = 'scan:start';
      const { scores, bearishSymbols } = await scanAiPickScores();

      stage = 'cache:start';
      await writeAiPickScores({ computedAt: new Date().toISOString(), scores, bearishSymbols });

      stage = 'archive:start';
      const archived = await archiveLensRadarHistory(scores);

      stage = 'job:complete';
      return { scored: scores.length, bearish: bearishSymbols.length, archived };
    }));
    if (!guarded.executed) {
      return NextResponse.json({ success: true, skipped: true, reason: guarded.reason, scanWindow }, { status: 202 });
    }
    const result = guarded.value;
    return NextResponse.json({ success: true, skipped: false, scanWindow, result });
  } catch (err) {
    logger.error('Job ai-pick-scan gagal', { stage, err });
    return NextResponse.json({ error: 'Job gagal', stage }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return runCronRoute(req, () => handlePOST(req));
}
