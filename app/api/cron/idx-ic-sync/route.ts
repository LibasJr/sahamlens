import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/shared/logger/logger';
import { importIdxIcCsv } from '@/modules/decision-agent/service/pilot-control.service';
import { recordDataSourceHealth } from '@/modules/observability/service/data-source-health.service';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { timingSafeStringEqual } from '@/shared/security/timing-safe-equal';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';
import { jakartaTodayIso, pickNewestCsv } from './helpers';

export const runtime = 'nodejs';
export const maxDuration = 900;
const execFileAsync = promisify(execFile);

// Sumber resmi: endpoint profil perusahaan BEI (dipakai scripts/sync-idx-ic.py).
const IDX_IC_SOURCE_URL = 'https://www.idx.co.id/primary/ListedCompany/GetCompanyProfiles';
const OUTPUT_DIR = path.resolve(process.cwd(), 'data/idx-ic');

interface IdxIcSyncResult {
  status: 'SUCCESS';
  imported: number;
  file: string;
}

async function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && timingSafeStringEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`);
}

async function runSync(): Promise<IdxIcSyncResult> {
  const script = path.resolve(process.cwd(), 'scripts/sync-idx-ic.py');
  const { stdout, stderr } = await execFileAsync('python3', [script], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    timeout: 10 * 60 * 1000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (stderr.trim()) logger.warn('sync-idx-ic menghasilkan stderr', { stderr: stderr.slice(-4000) });
  logger.info('sync-idx-ic selesai', { stdout: stdout.slice(-500) });

  const todayIso = jakartaTodayIso();
  const files = await fs.readdir(OUTPUT_DIR).catch(() => [] as string[]);
  const newest = pickNewestCsv(files, todayIso);
  if (!newest) throw new Error('sync-idx-ic tidak menghasilkan CSV klasifikasi yang bisa diimpor');

  const csvPath = path.join(OUTPUT_DIR, newest);
  const csvText = await fs.readFile(csvPath, 'utf8');
  if (!csvText.trim()) throw new Error(`CSV klasifikasi kosong: ${newest}`);

  const imported = await importIdxIcCsv({ csvText, sourceUrl: IDX_IC_SOURCE_URL, sourceAsOf: todayIso });
  // Pelajaran dari insiden senyap 2026-09-24: langkah yang "selesai" tapi tidak menulis apa pun
  // HARUS gagal, supaya alarm berbunyi alih-alih meninggalkan data basi diam-diam.
  if (imported <= 0) throw new Error('impor IDX-IC berjalan tanpa menulis satu baris pun');

  return { status: 'SUCCESS', imported, file: path.relative(process.cwd(), csvPath) };
}

async function handleGET(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await withJobRunLog('idx-ic-sync', async () => {
      const guarded = await runWithJobConcurrencyGuard('idx-ic-sync', runSync, 20 * 60);
      return guarded.executed
        ? guarded.value
        : ({ status: 'SUCCESS', imported: 0, file: 'SKIPPED' } satisfies IdxIcSyncResult);
    });
    await recordDataSourceHealth({
      sourceId: 'IDX_COMPANY_PROFILES',
      ok: true,
      force: true,
      detail: { ...result, sourceUrl: IDX_IC_SOURCE_URL },
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('idx-ic-sync gagal', { err: error });
    await recordDataSourceHealth({ sourceId: 'IDX_COMPANY_PROFILES', ok: false, force: true, detail: { error: message } });
    return NextResponse.json({ error: 'Sinkron klasifikasi IDX-IC gagal', detail: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return runCronRoute(req, () => handleGET(req));
}