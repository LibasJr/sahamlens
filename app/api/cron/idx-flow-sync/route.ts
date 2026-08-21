import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/shared/logger/logger';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { timingSafeStringEqual } from '@/shared/security/timing-safe-equal';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';

// Sinkronisasi harian data resmi BEI - menggantikan langkah manual:
//   1. scripts/sync-idx-foreign-flow.py    -> data/foreign-flow/{TICKER}.json
//   2. scripts/sync-idx-ihsg-eod.py         -> data/idx-index/ihsg.json
//   3. scripts/sync-idx-broker-summary.py  -> data/broker-summary/broker_{tanggal}.csv
//   4. scripts/import-broker-market-daily.mjs --confirm -> tabel broker_market_daily
//
// Kenapa lewat Python, bukan fetch() di route ini: idx.co.id ada di belakang Cloudflare
// yang menolak klien tanpa fingerprint TLS browser (403). curl_cffi dengan
// impersonate="chrome124" adalah satu-satunya jalur yang bekerja tanpa akun privat.
// Karena itu server WAJIB punya python3 + curl_cffi terpasang; kalau tidak, langkah
// terkait dilaporkan gagal apa adanya - tidak ada data pengganti yang dikarang.

export const runtime = 'nodejs';
export const maxDuration = 1800;

const execFileAsync = promisify(execFile);

const FOREIGN_FLOW_SCRIPT = 'scripts/sync-idx-foreign-flow.py';
const IHSG_EOD_SCRIPT = 'scripts/sync-idx-ihsg-eod.py';
const BROKER_SUMMARY_SCRIPT = 'scripts/sync-idx-broker-summary.py';
const BROKER_IMPORT_SCRIPT = 'scripts/import-broker-market-daily.mjs';

/** Universe default sengaja LQ45: 46 emiten selesai dalam ~1 menit dan itulah cakupan
 * yang dipakai halaman analisis. Ubah lewat env, bukan dengan mengedit route. */
const FOREIGN_FLOW_UNIVERSE = process.env.IDX_FLOW_SYNC_UNIVERSE || 'lq45';
const FOREIGN_FLOW_LENGTH = process.env.IDX_FLOW_SYNC_LENGTH || '90';
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';

interface StepResult {
  step: string;
  ok: boolean;
  detail: string;
}

interface SyncResult {
  status: 'SUCCESS' | 'PARTIAL' | 'SKIPPED';
  steps: StepResult[];
  brokerRowsInserted: number | null;
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && timingSafeStringEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`);
}

/** Jalankan satu langkah. Kegagalan TIDAK dilempar: langkah lain tetap dicoba dan
 * hasilnya dilaporkan per langkah, supaya satu skrip yang gagal tidak diam-diam
 * membatalkan sinkronisasi yang lain. */
async function runStep(
  step: string,
  command: string,
  args: string[],
  timeoutMs: number
): Promise<StepResult & { stdout: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, NODE_OPTIONS: '--dns-result-order=ipv4first --no-network-family-autoselection' },
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 12 * 1024 * 1024,
    });
    if (stderr.trim()) logger.warn(`idx-flow-sync ${step} menghasilkan stderr`, { stderr: stderr.slice(-4000) });
    const lastLine = stdout.trim().split(/\r?\n/).slice(-1)[0] ?? '';
    return { step, ok: true, detail: lastLine.slice(0, 500), stdout };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`idx-flow-sync ${step} gagal`, { error });
    return { step, ok: false, detail: message.slice(0, 500), stdout: '' };
  }
}

async function runSync(): Promise<SyncResult> {
  const root = process.cwd();
  const steps: StepResult[] = [];

  const foreignFlow = await runStep(
    'foreign-flow',
    PYTHON_BIN,
    [path.resolve(root, FOREIGN_FLOW_SCRIPT), '--universe', FOREIGN_FLOW_UNIVERSE, '--length', FOREIGN_FLOW_LENGTH],
    20 * 60 * 1000
  );
  steps.push({ step: foreignFlow.step, ok: foreignFlow.ok, detail: foreignFlow.detail });

  const ihsgEod = await runStep(
    'ihsg-eod',
    PYTHON_BIN,
    [path.resolve(root, IHSG_EOD_SCRIPT)],
    5 * 60 * 1000
  );
  steps.push({ step: ihsgEod.step, ok: ihsgEod.ok, detail: ihsgEod.detail });

  const brokerSummary = await runStep(
    'broker-summary-csv',
    PYTHON_BIN,
    [path.resolve(root, BROKER_SUMMARY_SCRIPT)],
    5 * 60 * 1000
  );
  steps.push({ step: brokerSummary.step, ok: brokerSummary.ok, detail: brokerSummary.detail });

  // Impor hanya dijalankan kalau CSV-nya memang baru berhasil diambil - mengimpor ulang
  // CSV lama tidak salah (append-only, ON CONFLICT DO NOTHING) tapi menghasilkan laporan
  // "0 baris masuk" yang membingungkan saat menelusuri kegagalan.
  let brokerRowsInserted: number | null = null;
  if (brokerSummary.ok) {
    const importStep = await runStep(
      'broker-import',
      process.execPath,
      [path.resolve(root, BROKER_IMPORT_SCRIPT), '--confirm', '--json'],
      10 * 60 * 1000
    );
    steps.push({ step: importStep.step, ok: importStep.ok, detail: importStep.detail });
    if (importStep.ok) {
      try {
        const parsed = JSON.parse(importStep.stdout.trim().split(/\r?\n/).slice(-1)[0] ?? '{}');
        brokerRowsInserted = typeof parsed.insertedRows === 'number' ? parsed.insertedRows : null;
      } catch {
        brokerRowsInserted = null;
      }
    }
  } else {
    steps.push({ step: 'broker-import', ok: false, detail: 'dilewati karena pengambilan CSV broker gagal' });
  }

  return {
    status: steps.every((s) => s.ok) ? 'SUCCESS' : 'PARTIAL',
    steps,
    brokerRowsInserted,
  };
}

async function handleGET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await withJobRunLog('idx-flow-sync', async () => {
      const guarded = await runWithJobConcurrencyGuard('idx-flow-sync', runSync, 40 * 60);
      return guarded.executed
        ? guarded.value
        : ({ status: 'SKIPPED', steps: [], brokerRowsInserted: null } satisfies SyncResult);
    });
    return NextResponse.json({ success: result.status !== 'PARTIAL', result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('idx-flow-sync gagal', { error });
    return NextResponse.json({ error: 'Sinkronisasi IDX gagal', detail: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return runCronRoute(req, () => handleGET(req));
}
