import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/shared/logger/logger';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { timingSafeStringEqual } from '@/shared/security/timing-safe-equal';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';

export const runtime = 'nodejs';
export const maxDuration = 900;

const execFileAsync = promisify(execFile);

interface KseiSyncResult {
  status: 'UPDATED' | 'UP_TO_DATE' | 'SKIPPED';
  source: string;
  reason?: string;
  latestDbDate?: string;
  latestDbDateBefore?: string;
  latestDbDateAfter?: string;
  latestArchiveDate?: string;
  newPeriods?: number;
  inserted?: number;
  alreadyExisting?: number;
  cacheDeleted?: number;
  cacheInvalidationSkipped?: boolean;
}

function mergeNodeOptions(existing = ''): string {
  const required = ['--dns-result-order=ipv4first', '--no-network-family-autoselection'];
  const tokens = existing.trim().split(/\s+/).filter(Boolean);
  for (const option of required) {
    if (!tokens.includes(option)) tokens.push(option);
  }
  return tokens.join(' ');
}

function parseSyncResult(stdout: string): KseiSyncResult {
  const marker = stdout
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.startsWith('SAHAMLENS_SYNC_RESULT='));

  if (!marker) throw new Error('sync script selesai tanpa marker hasil');
  const raw = marker.slice('SAHAMLENS_SYNC_RESULT='.length);
  return JSON.parse(raw) as KseiSyncResult;
}

async function runArchiveSync(): Promise<KseiSyncResult> {
  const cwd = process.cwd();
  const script = path.resolve(cwd, 'scripts/sync-ownership-flow-ksei.mjs');
  const { stdout, stderr } = await execFileAsync(process.execPath, [script], {
    cwd,
    env: {
      ...process.env,
      NODE_OPTIONS: mergeNodeOptions(process.env.NODE_OPTIONS ?? ''),
    },
    encoding: 'utf8',
    timeout: 14 * 60 * 1000,
    maxBuffer: 8 * 1024 * 1024,
  });

  if (stderr.trim()) {
    logger.warn('ownership-flow-ksei-sync menghasilkan stderr', {
      stderr: stderr.slice(-4_000),
    });
  }
  return parseSyncResult(stdout);
}

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return timingSafeStringEqual(
    req.headers.get('authorization') ?? '',
    `Bearer ${secret}`
  );
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    logger.warn('Menolak GET /api/cron/ownership-flow-ksei-sync - CRON_SECRET tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await withJobRunLog('ownership-flow-ksei-sync', async () => {
      const guarded = await runWithJobConcurrencyGuard(
        'ownership-flow-ksei-sync',
        runArchiveSync,
        20 * 60
      );
      if (!guarded.executed) {
        return { status: 'SKIPPED', reason: 'job_already_running' } as const;
      }
      return guarded.value;
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    logger.error('Job ownership-flow-ksei-sync gagal', { error });
    return NextResponse.json(
      {
        error: 'Job ownership-flow-ksei-sync gagal',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
