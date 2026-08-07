import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { logger } from '@/shared/logger/logger';
import { scanAiPickScores } from '@/modules/recommendation/service/ai-pick-scan.service';
import { writeAiPickScores } from '@/shared/cache/ai-pick-cache';
import { archiveLensRadarHistory } from '@/modules/lens-radar/service/history-archive.service';

export const maxDuration = 300;

// Menyiapkan skor siap pakai untuk /api/ai-pick. Inilah yang membuat halaman AI Pick
// berhenti memindai sendiri: pekerjaan yang dulu dilakukan ~22 request per klik di tab
// Rekomendasi sekarang dikerjakan sekali di sini untuk seluruh universe.
export async function POST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const rawBody = await req.text();

  if (!(await verifyQStashSignature(signature, rawBody))) {
    logger.warn('Menolak request /api/cron/ai-pick-scan - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let stage = 'request:accepted';

  try {
    const result = await withJobRunLog('ai-pick-scan', async () => {
      stage = 'scan:start';
      const { scores, bearishSymbols } = await scanAiPickScores();

      stage = 'cache:start';
      await writeAiPickScores({ computedAt: new Date().toISOString(), scores, bearishSymbols });

      stage = 'archive:start';
      const archived = await archiveLensRadarHistory(scores);

      stage = 'job:complete';
      return { scored: scores.length, bearish: bearishSymbols.length, archived };
    });
    return NextResponse.json({ success: true, result });
  } catch (err) {
    logger.error('Job ai-pick-scan gagal', { stage, err });
    return NextResponse.json({ error: 'Job gagal', stage }, { status: 500 });
  }
}
