import crypto from 'node:crypto';
import { cacheGet } from '@/shared/cache/redis-cache';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { readAiPickScores, type AiPickScores } from '@/shared/cache/ai-pick-cache';
import { getLensScoreValidationStatus } from '@/modules/validation';
import type { NewsItem } from '@/modules/news';
import { getIdxIcSectorMap, getOpenPaperPositionTickers, hasActivePilotProtocol, insertDecisionRun } from '../repository/decision-agent.repository';
import { logger } from '@/shared/logger/logger';
import { isTradingDay } from '@/shared/calendar/idx-trading-calendar';
import { buildDecisionSignal } from './decision-engine';
import { notifyDecisionSignalTransitions } from './decision-notification.service';
import { applyHybridAnalysis } from './hybrid-analyst.service';
import {
  DECISION_AGENT_VERSION,
  type DecisionAgentRun,
  type DecisionAgentRunSummary,
} from '../types/decision-agent.types';

type CachedMarketNews = { items?: NewsItem[] };

export interface DecisionScanOptions {
  trigger: 'ADMIN' | 'SCHEDULED';
  scores?: AiPickScores | null;
  news?: CachedMarketNews | null;
  now?: Date;
  persist?: boolean;
  heldTickers?: ReadonlySet<string>;
  hybrid?: boolean;
}

function summarize(signals: DecisionAgentRun['signals']): DecisionAgentRunSummary {
  return {
    total: signals.length,
    buyCandidates: signals.filter((signal) => signal.action === 'BUY_CANDIDATE').length,
    watch: signals.filter((signal) => signal.action === 'WATCH').length,
    hold: signals.filter((signal) => signal.action === 'HOLD').length,
    exitReview: signals.filter((signal) => signal.action === 'EXIT_REVIEW').length,
    noSignal: signals.filter((signal) => signal.action === 'NO_SIGNAL').length,
    paperReady: signals.filter((signal) => signal.paperReadiness === 'PAPER_READY' && signal.hybridStatus === 'CONFIRMED').length,
    rulePaperReady: signals.filter((signal) => signal.paperReadiness === 'PAPER_READY').length,
    liveReady: 0,
  };
}

export async function runDecisionAgentScan(options: DecisionScanOptions): Promise<DecisionAgentRun | null> {
  const scheduledAt = options.now ?? new Date();
  if (options.trigger === 'SCHEDULED' && (!isTradingDay(scheduledAt) || !(await hasActivePilotProtocol(scheduledAt)))) return null;
  const scores = options.scores === undefined ? await readAiPickScores() : options.scores;
  if (!scores || !Array.isArray(scores.scores) || scores.scores.length === 0) return null;

  const [news, sectorMap] = await Promise.all([
    options.news === undefined
      ? cacheGet<CachedMarketNews>(COMPUTED_CACHE_KEY.MARKET_NEWS)
      : Promise.resolve(options.news),
    getIdxIcSectorMap(scores.scores.map((stock) => stock.symbol)),
  ]);
  const newsItems = Array.isArray(news?.items) ? news.items : [];
  const validation = getLensScoreValidationStatus();
  const bearish = new Set(scores.bearishSymbols);
  const now = options.now ?? new Date();

  const ruleSignals = scores.scores
    .map((stock) => buildDecisionSignal({
      stock,
      bearish: bearish.has(stock.symbol),
      newsItems,
      dataAsOf: scores.computedAt,
      now,
      modelValidated: validation.validated,
      sector: sectorMap.get(stock.symbol.replace(/\.JK$/i, '').toUpperCase()) ?? null,
    }))
    .sort((a, b) => b.lensScore - a.lensScore || a.ticker.localeCompare(b.ticker));

  const heldTickers = options.heldTickers ?? (options.persist === false ? new Set<string>() : await getOpenPaperPositionTickers());
  const hybrid = options.hybrid === false
    ? {
        signals: ruleSignals,
        meta: { status: 'SKIPPED_NOT_CONFIGURED' as const, model: null, reviewedCount: 0, inputTokens: null, outputTokens: null, errorCode: 'DISABLED' },
      }
    : await applyHybridAnalysis({ signals: ruleSignals, heldTickers, now });

  const run: DecisionAgentRun = {
    id: crypto.randomUUID(),
    createdAt: now.toISOString(),
    dataAsOf: scores.computedAt,
    trigger: options.trigger,
    modelValidated: validation.validated,
    version: DECISION_AGENT_VERSION,
    summary: summarize(hybrid.signals),
    hybrid: hybrid.meta,
    signals: hybrid.signals,
  };

  if (options.persist === false) return run;
  const persisted = await insertDecisionRun({
    dataAsOf: run.dataAsOf,
    trigger: run.trigger,
    modelValidated: run.modelValidated,
    version: run.version,
    summary: run.summary,
    hybrid: run.hybrid,
    signals: run.signals,
  });
  if (options.trigger === 'SCHEDULED') {
    try {
      await notifyDecisionSignalTransitions(persisted.id);
    } catch (err) {
      // Alert adalah side effect sekunder: kegagalannya tidak boleh membatalkan
      // evidence run yang sudah tersimpan atau scan AI Pick utama.
      logger.error('Pemeriksaan notifikasi decision agent gagal', { module: 'decision-agent', runId: persisted.id, err });
    }
  }
  return persisted;
}
