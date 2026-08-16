import { NextRequest, NextResponse } from 'next/server';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { withJobRunLog, recordJobNonRun } from '@/shared/scheduler/job-run-log.repository';
import { logger } from '@/shared/logger/logger';
import { getOwnershipFlowConfig } from '@/modules/ownership-flow/config/ownership-flow.config';
import { runOwnershipFlowIngestion } from '@/modules/ownership-flow/service/ownership-flow-ingest.service';
import { OWNERSHIP_FLOW_JOB_NAME } from '@/modules/ownership-flow/service/ownership-flow-monitor.service';

// CRON OWNERSHIP FLOW - job BARU dan TERPISAH dari broker-summary-scan.
//
// Menumpang cron broker summary akan mencampur dua siklus data yang berbeda
// sumber, berbeda cadence, dan berbeda maknanya - selain menghidupkan kembali
// job yang justru sengaja dimatikan.
//
// CADENCE: 1x SEHARI. Data kepemilikan bukan data intraday; menjalankannya tiap
// 5 menit hanya membebani sumber tanpa menghasilkan satu pun observasi baru.
//
// JAM PUBLIKASI TIDAK DIASUMSIKAN. Kita belum punya bukti pukul berapa sumber
// memperbarui datanya - itu salah satu hal yang harus dijawab audit di VPS.
// Karena itu jadwalnya dibuat DAPAT DIKONFIGURASI di sisi scheduler (systemd/
// QStash), bukan dipatok dari tebakan di dalam kode. Sampai audit selesai, job
// ini berhenti di gerbang dan tidak melakukan request apa pun.

export const maxDuration = 300;

async function execute() {
  const config = getOwnershipFlowConfig();

  // Cron dimatikan operator: catat sebagai SKIPPED, jangan diam. Job yang tidak
  // pernah meninggalkan jejak tidak bisa didiagnosis ("sudah 4 hari kosong -
  // tidak pernah dipanggil, atau dipanggil lalu dilewati?").
  if (!config.cronEnabled) {
    await recordJobNonRun(OWNERSHIP_FLOW_JOB_NAME, 'SKIPPED', 'OWNERSHIP_FLOW_CRON_ENABLED belum aktif');
    return NextResponse.json(
      { success: true, skipped: true, reason: 'OWNERSHIP_FLOW_CRON_ENABLED belum aktif' },
      { status: 202 }
    );
  }

  const guarded = await runWithJobConcurrencyGuard(OWNERSHIP_FLOW_JOB_NAME, () =>
    withJobRunLog(OWNERSHIP_FLOW_JOB_NAME, async () => {
      const result = await runOwnershipFlowIngestion();

      // Gerbang menolak (sumber belum terverifikasi): job SELESAI dengan jujur -
      // bukan "sukses" (tidak ada yang dikerjakan) dan bukan "gagal" (tidak ada
      // yang rusak). Statusnya dicatat apa adanya di meta job_run_log.
      if (result.status === 'BLOCKED') {
        logger.info('Ownership Flow scan dilewati - gerbang sumber tertutup', {
          module: 'ownership-flow',
          job: OWNERSHIP_FLOW_JOB_NAME,
          errorCode: result.gate.reason,
          source: result.source,
        });
      }

      return result;
    })
  );

  if (!guarded.executed) {
    return NextResponse.json(
      { success: true, skipped: true, reason: guarded.reason },
      { status: 202 }
    );
  }

  const result = guarded.value;
  // PARTIAL_SUCCESS TIDAK disamarkan sebagai success penuh (§27): flag `success`
  // hanya true ketika seluruh ticker berhasil. Yang gagal tetap terhitung di
  // `failed`, dan job secara keseluruhan tidak dibatalkan karenanya.
  return NextResponse.json({
    success: result.status === 'SUCCESS',
    status: result.status,
    result,
  });
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return await execute();
  } catch (error) {
    logger.error('Job ownership-flow-scan gagal', { module: 'ownership-flow', error });
    return NextResponse.json({ error: 'Job ownership flow gagal' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const rawBody = await req.text();
  if (!(await verifyQStashSignature(signature, rawBody))) {
    logger.warn('Menolak request /api/cron/ownership-flow-scan - signature QStash tidak valid');
    await recordJobNonRun(OWNERSHIP_FLOW_JOB_NAME, 'REJECTED', 'Signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return await execute();
  } catch (error) {
    logger.error('Job ownership-flow-scan gagal', { module: 'ownership-flow', error });
    return NextResponse.json({ error: 'Job ownership flow gagal' }, { status: 500 });
  }
}
