import crypto from 'node:crypto';
import { cacheGet } from '@/shared/cache/redis-cache';
import { COMPUTED_CACHE_KEY } from '@/shared/cache/computed-keys';
import { readAiPickScores, type AiPickScores } from '@/shared/cache/ai-pick-cache';
import { getLensScoreValidationStatus } from '@/modules/validation';
import type { NewsItem } from '@/modules/news';
import { insertDecisionRun } from '../repository/decision-agent.repository';
import { logger } from '@/shared/logger/logger';
import { buildDecisionSignal } from './decision-engine';
import { notifyDecisionSignalTransitions } from './decision-notification.service';
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
}

function summarize(signals: DecisionAgentRun['signals']): DecisionAgentRunSummary {
  return {
    total: signals.length,
    buyCandidates: signals.filter((signal) => signal.action === 'BUY_CANDIDATE').length,
    watch: signals.filter((signal) => signal.action === 'WATCH').length,
    hold: signals.filter((signal) => signal.action === 'HOLD').length,
    exitReview: signals.filter((signal) => signal.action === 'EXIT_REVIEW').length,
    noSignal: signals.filter((signal) => signal.action === 'NO_SIGNAL').length,
    paperReady: signals.filter((signal) => signal.paperReadiness === 'PAPER_READY').length,
    liveReady: 0,
  };
}

export async function runDecisionAgentScan(options: DecisionScanOptions): Promise<DecisionAgentRun | null> {
  const scores = options.scores === undefined ? await readAiPickScores() : options.scores;
  if (!scores || !Array.isArray(scores.scores) || scores.scores.length === 0) return null;

  const news = options.news === undefined
    ? await cacheGet<CachedMarketNews>(COMPUTED_CACHE_KEY.MARKET_NEWS)
    : options.news;
  const newsItems = Array.isArray(news?.items) ? news.items : [];
  const validation = getLensScoreValidationStatus();
  const bearish = new Set(scores.bearishSymbols);
  const now = options.now ?? new Date();

  const signals = scores.scores
    .map((stock) => buildDecisionSignal({
      stock,
      bearish: bearish.has(stock.symbol),
      newsItems,
      dataAsOf: scores.computedAt,
      now,
      modelValidated: validation.validated,
    }))
    .sort((a, b) => b.lensScore - a.lensScore || a.ticker.localeCompare(b.ticker));

  const run: DecisionAgentRun = {
    id: crypto.randomUUID(),
    createdAt: now.toISOString(),
    dataAsOf: scores.computedAt,
    trigger: options.trigger,
    modelValidated: validation.validated,
    version: DECISION_AGENT_VERSION,
    summary: summarize(signals),
    signals,
  };

  if (options.persist === false) return run;
  const persisted = await insertDecisionRun({
    dataAsOf: run.dataAsOf,
    trigger: run.trigger,
    modelValidated: run.modelValidated,
    version: run.version,
    summary: run.summary,
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
