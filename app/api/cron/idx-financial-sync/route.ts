import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/shared/logger/logger';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { timingSafeStringEqual } from '@/shared/security/timing-safe-equal';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';
import { resolveIdxFinancialSyncTargets } from '@/modules/fundamental/service/idx-financial-sync-targets';

// Sinkronisasi laporan keuangan kuartalan RESMI BEI (XBRL) - menggantikan langkah manual
// scripts/sync-idx-financial-reports.py, dan merupakan prasyarat terakhir sebelum
// modules/fundamental/service/idx-fundamental-input.service.ts punya artefak untuk
// dibaca di produksi. Tanpa cron ini, data/idx-financial/ di VPS kosong dan seluruh
// jalur XBRL -> LensScore tidak pernah punya masukan.
//
// Kenapa lewat Python, bukan fetch() di route ini: alasan yang sama persis dengan
// idx-flow-sync - idx.co.id di belakang Cloudflare yang menolak klien tanpa fingerprint
// TLS browser (403). curl_cffi impersonate="chrome124" satu-satunya jalur yang bekerja.
//
// SIFAT IDEMPOTEN ITU BAGIAN DARI DESAIN JADWALNYA. Skrip melewati emiten yang
// File_Modified-nya tidak berubah, jadi jalan pertama berat (ratusan unduhan) sementara
// jalan berikutnya nyaris gratis. Konsekuensi yang disengaja: kalau satu jalan terpotong
// timeout, kemajuannya TIDAK hilang - jalan berikutnya melanjutkan dari yang belum ada.

export const runtime = 'nodejs';
export const maxDuration = 3600;

const execFileAsync = promisify(execFile);

const SYNC_SCRIPT = 'scripts/sync-idx-financial-reports.py';
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';

/** Seluruh pasar. `--page-size` menentukan JANGKAUAN, bukan sekadar ukuran halaman:
 * skrip berhenti setelah satu halaman kalau BEI tidak mengembalikan ResultCount yang
 * wajar, sehingga nilai kecil membuat sync diam-diam hanya menjangkau emiten pertama
 * dan tetap terlihat sukses. */
const PAGE_SIZE = process.env.IDX_FINANCIAL_PAGE_SIZE || '900';
/** Jeda antar emiten. Dinaikkan dari default 0,4 detik karena Cloudflare BEI membalas
 * 403 sesaat saat dipanggil terlalu rapat beruntun - teramati 2026-08-22. */
const SLEEP_SECONDS = process.env.IDX_FINANCIAL_SLEEP || '1.0';
const RETRIES = process.env.IDX_FINANCIAL_RETRIES || '5';

const STEP_TIMEOUT_MS = 40 * 60 * 1000;

interface StepResult {
  step: string;
  ok: boolean;
  detail: string;
}

interface SyncResult {
  status: 'SUCCESS' | 'PARTIAL' | 'SKIPPED';
  targets: { year: number; period: string; reason: string }[];
  steps: StepResult[];
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && timingSafeStringEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`);
}

/** Kegagalan satu periode TIDAK dilempar: periode lain tetap dicoba dan hasilnya
 * dilaporkan per langkah. Satu periode yang bermasalah tidak boleh diam-diam
 * membatalkan periode yang sebenarnya baik-baik saja. */
async function runStep(step: string, args: string[]): Promise<StepResult> {
  try {
    const { stdout, stderr } = await execFileAsync(PYTHON_BIN, args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: STEP_TIMEOUT_MS,
      maxBuffer: 12 * 1024 * 1024,
    });
    if (stderr.trim()) logger.warn(`idx-financial-sync ${step} menghasilkan stderr`, { stderr: stderr.slice(-4000) });
    const lastLine = stdout.trim().split(/\r?\n/).slice(-1)[0] ?? '';
    return { step, ok: true, detail: lastLine.slice(0, 500) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`idx-financial-sync ${step} gagal`, { err: error });
    return { step, ok: false, detail: message.slice(0, 500) };
  }
}

async function runSync(now: Date): Promise<SyncResult> {
  const script = path.resolve(process.cwd(), SYNC_SCRIPT);
  const targets = resolveIdxFinancialSyncTargets(now);
  const steps: StepResult[] = [];

  for (const target of targets) {
    steps.push(await runStep(`${target.year}-${target.period}`, [
      script,
      '--year', String(target.year),
      '--period', target.period,
      '--page-size', PAGE_SIZE,
      '--limit', '0',
      '--sleep', SLEEP_SECONDS,
      '--retries', RETRIES,
    ]));
  }

  return {
    status: steps.every((s) => s.ok) ? 'SUCCESS' : 'PARTIAL',
    targets,
    steps,
  };
}

async function handleGET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await withJobRunLog('idx-financial-sync', async () => {
      const guarded = await runWithJobConcurrencyGuard('idx-financial-sync', () => runSync(new Date()), 90 * 60);
      return guarded.executed
        ? guarded.value
        : ({ status: 'SKIPPED', targets: [], steps: [] } satisfies SyncResult);
    });
    return NextResponse.json({ success: result.status !== 'PARTIAL', result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('idx-financial-sync gagal', { err: error });
    return NextResponse.json({ error: 'Sinkronisasi laporan keuangan IDX gagal', detail: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return runCronRoute(req, () => handleGET(req));
}
