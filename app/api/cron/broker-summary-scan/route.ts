import { NextRequest, NextResponse } from 'next/server';
import { syncIndexAlphaBrokerSummary } from '@/modules/broker-flow/service/index-alpha-broker-summary.service';
import { readAiPickScores } from '@/shared/cache/ai-pick-cache';
import { cacheGet } from '@/shared/cache/redis-cache';
import { rankAiPicks, type BreakoutInfo } from '@/modules/recommendation/service/ai-pick.service';
import { getLensScoreValidationStatus } from '@/modules/validation';
import { verifyQStashSignature } from '@/shared/queue/qstash-signature';
import { runWithJobConcurrencyGuard } from '@/shared/queue/job-concurrency-guard';
import { withJobRunLog } from '@/shared/scheduler/job-run-log.repository';
import { todayDateKeyWIB } from '@/shared/market/trading-session';
import { logger } from '@/shared/logger/logger';

export const maxDuration = 300;

const BREAKOUT_CACHE_KEY = 'sahamlens:cache:computed:breakout-radar';

async function runScan() {
  const tradeDate = todayDateKeyWIB();
  const scoreData = await readAiPickScores();
  if (!scoreData || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date(scoreData.computedAt)) !== tradeDate) {
    return { skipped: true, reason: 'LensRadar hari ini belum tersedia', tradeDate };
  }
  const cachedBreakout = await cacheGet<any>(BREAKOUT_CACHE_KEY);
  const breakout: BreakoutInfo = {
    breakoutSymbols: (cachedBreakout?.data || []).map((item: any) => item.symbol),
    goldenCrossSymbols: (cachedBreakout?.crossSignals?.golden || []).map((item: any) => item.symbol),
    deadCrossSymbols: (cachedBreakout?.crossSignals?.dead || []).map((item: any) => item.symbol),
  };
  const validation = getLensScoreValidationStatus();
  const tickers = rankAiPicks(scoreData.scores, breakout, scoreData.bearishSymbols, {
    mode: validation.validated ? 'advisory' : 'scanner',
  }).map((item) => item.symbol);
  if (!tickers.length) return { skipped: true, reason: 'Tidak ada saham yang lolos LensRadar', tradeDate };
  return syncIndexAlphaBrokerSummary({ tickers, tradeDate });
}

async function execute() {
  const guarded = await runWithJobConcurrencyGuard('broker-summary-scan', () =>
    withJobRunLog('broker-summary-scan', runScan),
  );
  if (!guarded.executed) return NextResponse.json({ success: true, skipped: true, reason: guarded.reason }, { status: 202 });
  return NextResponse.json({ success: true, skipped: false, result: guarded.value });
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try { return await execute(); } catch (error) {
    logger.error('Job broker-summary-scan gagal', { error });
    return NextResponse.json({ error: 'Job broker summary gagal' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('Upstash-Signature');
  const rawBody = await req.text();
  if (!(await verifyQStashSignature(signature, rawBody))) {
    logger.warn('Menolak request /api/cron/broker-summary-scan - signature QStash tidak valid');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return await execute();
  } catch (error) {
    logger.error('Job broker-summary-scan gagal', { error });
    return NextResponse.json({ error: 'Job broker summary gagal' }, { status: 500 });
  }
}
