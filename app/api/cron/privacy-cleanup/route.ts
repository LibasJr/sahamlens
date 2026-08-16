import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/shared/logger/logger';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { timingSafeStringEqual } from '@/shared/security/timing-safe-equal';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';

export const runtime = 'nodejs';
export const maxDuration = 300;
const execFileAsync = promisify(execFile);

interface PrivacyCleanupResult {
  status: 'SUCCESS';
  deleted: Record<string, number>;
  policy: Record<string, number>;
}

function parseResult(stdout: string): PrivacyCleanupResult {
  const marker = stdout.split(/\r?\n/).reverse().find((line) => line.startsWith('SAHAMLENS_PRIVACY_CLEANUP_RESULT='));
  if (!marker) throw new Error('privacy cleanup selesai tanpa marker hasil');
  return JSON.parse(marker.slice('SAHAMLENS_PRIVACY_CLEANUP_RESULT='.length)) as PrivacyCleanupResult;
}

async function authorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && timingSafeStringEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`);
}

async function runCleanup(): Promise<PrivacyCleanupResult> {
  const cwd = process.cwd();
  const script = path.resolve(cwd, 'scripts/cleanup-privacy-retention.mjs');
  const { stdout, stderr } = await execFileAsync(process.execPath, [script, '--confirm'], {
    cwd,
    env: process.env,
    encoding: 'utf8',
    timeout: 4 * 60 * 1000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (stderr.trim()) logger.warn('privacy-cleanup menghasilkan stderr', { stderr: stderr.slice(-2_000) });
  return parseResult(stdout);
}

export async function GET(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await withJobRunLog('privacy-cleanup', async () => {
      const guarded = await runWithJobConcurrencyGuard('privacy-cleanup', runCleanup, 10 * 60);
      return guarded.executed ? guarded.value : { status: 'SKIPPED', reason: 'job_already_running' } as const;
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    logger.error('Job privacy-cleanup gagal', { error });
    return NextResponse.json({ error: 'Job privacy-cleanup gagal' }, { status: 500 });
  }
}
