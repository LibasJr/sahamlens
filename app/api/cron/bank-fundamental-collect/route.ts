import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/shared/logger/logger';
import { recordDataSourceHealth } from '@/modules/observability/service/data-source-health.service';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { timingSafeStringEqual } from '@/shared/security/timing-safe-equal';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { runCronRoute } from '@/shared/scheduler/cron-route.adapter';

export const runtime = 'nodejs';
export const maxDuration = 1200;
const execFileAsync = promisify(execFile);

interface CollectorResult {
  status: 'SUCCESS' | 'PARTIAL';
  runId: string;
  inserted: number;
  existing: number;
  accepted: number;
  quarantined: number;
  pagesChecked: number;
  docsDiscovered: number;
  docsParsed: number;
  sourceErrors: Array<{ ticker: string; error: string }>;
}

function parseResult(stdout: string): CollectorResult {
  const marker = stdout.split(/\r?\n/).reverse().find((line) => line.startsWith('SAHAMLENS_BANK_COLLECT_RESULT='));
  if (!marker) throw new Error('collector selesai tanpa marker hasil');
  const parsed = JSON.parse(marker.slice('SAHAMLENS_BANK_COLLECT_RESULT='.length)) as CollectorResult;
  if (!['SUCCESS', 'PARTIAL'].includes(parsed.status)) throw new Error(`collector status tidak valid: ${parsed.status}`);
  return parsed;
}

async function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && timingSafeStringEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`);
}

async function runCollector(): Promise<CollectorResult> {
  const script = path.resolve(process.cwd(), 'scripts/collect-bank-metric-evidence-auto.mjs');
  const { stdout, stderr } = await execFileAsync(process.execPath, [script, '--confirm'], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_OPTIONS: '--dns-result-order=ipv4first --no-network-family-autoselection' },
    encoding: 'utf8',
    timeout: 19 * 60 * 1000,
    maxBuffer: 12 * 1024 * 1024,
  });
  if (stderr.trim()) logger.warn('bank-fundamental-collector menghasilkan stderr', { stderr: stderr.slice(-5000) });
  return parseResult(stdout);
}

async function handleGET(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await withJobRunLog('bank-fundamental-collect', async () => {
      const guarded = await runWithJobConcurrencyGuard('bank-fundamental-collect', runCollector, 25 * 60);
      return guarded.executed ? guarded.value : ({ status: 'PARTIAL', runId: 'SKIPPED', inserted: 0, existing: 0, accepted: 0, quarantined: 0, pagesChecked: 0, docsDiscovered: 0, docsParsed: 0, sourceErrors: [] } satisfies CollectorResult);
    });
    await recordDataSourceHealth({ sourceId: 'BANK_ISSUER_IR_AUTO_COLLECTOR', ok: true, force: true, detail: { ...result } });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('bank-fundamental-collect gagal', { err: error });
    await recordDataSourceHealth({ sourceId: 'BANK_ISSUER_IR_AUTO_COLLECTOR', ok: false, force: true, detail: { error: message } });
    return NextResponse.json({ error: 'Bank fundamental collector gagal', detail: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return runCronRoute(req, () => handleGET(req));
}
