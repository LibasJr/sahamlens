import type { NewsItem } from '@/modules/news';
import type { ScoredStock } from '@/modules/recommendation/service/ai-pick.service';
import { matchesCompany } from '@/modules/news/service/news.service';
import {
  DECISION_AGENT_VERSION,
  type DecisionAction,
  type DecisionAgentSignal,
  type DecisionNewsEvidence,
  type DecisionRiskSetup,
} from '../types/decision-agent.types';

const MIN_COVERAGE_PCT = 70;
const BUY_CANDIDATE_SCORE = 70;
const WATCH_SCORE = 60;
const MAX_EXECUTABLE_AGE_MINUTES = 30;

export interface BuildDecisionInput {
  stock: ScoredStock;
  bearish: boolean;
  newsItems: NewsItem[];
  dataAsOf: string;
  now?: Date;
  modelValidated: boolean;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function dataAgeMinutes(dataAsOf: string, now: Date): number | null {
  const timestamp = new Date(dataAsOf).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, (now.getTime() - timestamp) / 60_000);
}

function newsEvidence(ticker: string, items: NewsItem[]): DecisionNewsEvidence {
  const matched = items.filter((item) => matchesCompany(item.title, ticker));
  return {
    positive: matched.filter((item) => item.sentiment === 'POSITIF').length,
    neutral: matched.filter((item) => item.sentiment === 'NETRAL').length,
    negative: matched.filter((item) => item.sentiment === 'NEGATIF').length,
    matchedHeadlines: matched.slice(0, 3).map((item) => item.title),
    basis: matched.length > 0 ? 'HEADLINE_ONLY' : 'UNAVAILABLE',
  };
}

function riskSetup(stock: ScoredStock): DecisionRiskSetup | null {
  const setup = stock.tradeSetup;
  if (!setup || !finite(stock.price) || stock.price <= 0) return null;
  if (![setup.cl1, setup.tp1, setup.tp2, setup.rr].every(finite)) return null;
  const risk = stock.price - setup.cl1;
  if (risk <= 0 || setup.rr < 1.5) return null;
  return {
    entry: stock.price,
    stop: setup.cl1,
    target1: setup.tp1,
    target2: setup.tp2,
    riskReward: setup.rr,
    riskPct: Number(((risk / stock.price) * 100).toFixed(2)),
  };
}

export function buildDecisionSignal(input: BuildDecisionInput): DecisionAgentSignal {
  const now = input.now ?? new Date();
  const stock = input.stock;
  const news = newsEvidence(stock.symbol, input.newsItems);
  const setup = riskSetup(stock);
  const ageMinutes = dataAgeMinutes(input.dataAsOf, now);
  const stale = ageMinutes == null || ageMinutes > MAX_EXECUTABLE_AGE_MINUTES;
  const coverageOk = finite(stock.coverage) && stock.coverage >= MIN_COVERAGE_PCT;
  const breakdownAvailable = stock.breakdown != null
    && finite(stock.breakdown.technical)
    && finite(stock.breakdown.fundamental)
    && finite(stock.breakdown.flow);
  const eligible = stock.eligibilityStatus === 'ELIGIBLE';
  const categoryKnown = stock.kategori != null && stock.kategori !== 'DATA TIDAK CUKUP';
  const dataQualityOk = coverageOk && eligible && categoryKnown && breakdownAvailable;

  let action: DecisionAction = 'HOLD';
  const opposingReasons: string[] = [];
  const invalidationReasons: string[] = [];

  if (!dataQualityOk) {
    action = 'NO_SIGNAL';
    invalidationReasons.push('Kualitas atau kelayakan data belum memenuhi gerbang internal.');
  } else if (input.bearish || stock.kategori?.includes('SELL')) {
    action = 'EXIT_REVIEW';
    opposingReasons.push('Tren atau kategori teknikal berada pada sisi bearish.');
  } else if (stock.totalScore >= BUY_CANDIDATE_SCORE && setup && news.negative <= news.positive) {
    action = 'BUY_CANDIDATE';
  } else if (stock.totalScore >= WATCH_SCORE) {
    action = 'WATCH';
  }

  if (news.negative > news.positive) {
    opposingReasons.push('Sentimen judul berita negatif lebih banyak daripada positif.');
    if (action === 'BUY_CANDIDATE') action = 'WATCH';
  }
  if (!setup && action === 'BUY_CANDIDATE') {
    action = 'WATCH';
    opposingReasons.push('Belum tersedia setup risiko dengan RR minimum 1,5.');
  }
  if (stale) opposingReasons.push('Snapshot terlalu lama untuk dipakai mengeksekusi order baru.');
  if (!input.modelValidated) invalidationReasons.push('Model belum lolos validasi point-in-time yang dibekukan.');

  const paperReady = !stale && dataQualityOk && (
    (action === 'BUY_CANDIDATE' && setup != null) || action === 'EXIT_REVIEW'
  );

  return {
    ticker: stock.symbol.replace(/\.JK$/, ''),
    action,
    price: stock.price,
    lensScore: stock.totalScore,
    coveragePct: finite(stock.coverage) ? stock.coverage : null,
    paperReadiness: paperReady ? 'PAPER_READY' : 'RESEARCH_ONLY',
    liveReadiness: !dataQualityOk
      ? 'BLOCKED_DATA_QUALITY'
      : stale
        ? 'BLOCKED_STALE_DATA'
        : !input.modelValidated
          ? 'BLOCKED_MODEL_UNVALIDATED'
          : 'BLOCKED_BROKER_NOT_CONFIGURED',
    dataAsOf: input.dataAsOf,
    stale,
    modelValidated: input.modelValidated,
    scoreBreakdown: breakdownAvailable ? stock.breakdown : null,
    riskSetup: setup,
    news,
    supportingReasons: (stock.topReasons ?? []).slice(0, 3),
    opposingReasons,
    invalidationReasons,
    eligibilityReasons: stock.eligibilityReasons ?? [],
    version: DECISION_AGENT_VERSION,
  };
}
