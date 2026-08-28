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
  sector?: string | null;
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
  const matched = items.filter((item) => matchesCompany(`${item.title} ${item.summary ?? ''}`, ticker));
  const hasSummary = matched.some((item) => item.evidenceBasis === 'RSS_SUMMARY');
  return {
    positive: matched.filter((item) => item.sentiment === 'POSITIF').length,
    neutral: matched.filter((item) => item.sentiment === 'NETRAL').length,
    negative: matched.filter((item) => item.sentiment === 'NEGATIF').length,
    matchedHeadlines: matched.slice(0, 3).map((item) => item.title),
    matchedArticles: matched.slice(0, 3).map((item) => ({
      title: item.title,
      source: item.source,
      url: item.link,
      publishedAt: item.pubDate,
      eventType: item.intelligence?.eventType ?? 'OTHER',
      basis: item.evidenceBasis === 'RSS_SUMMARY' ? 'RSS_SUMMARY' : 'HEADLINE_ONLY',
    })),
    basis: matched.length === 0 ? 'UNAVAILABLE' : hasSummary ? 'RSS_SUMMARY' : 'HEADLINE_ONLY',
  };
}

function riskSetup(stock: ScoredStock): DecisionRiskSetup | null {
  // TradePlan v1.0 (formula terbaru) diutamakan; tradeSetup lama cuma fallback untuk
  // entri cache lama (lihat catatan di ai-pick.service.ts). Angka cl1/tp1/tp2/rr
  // pada dasarnya sama nilainya - TradePlan v1.0 membungkus buildLongTradingSetup
  // yang sama - tapi menyamakan sumbernya di sini menjaga Decision Agent konsisten
  // dengan apa yang ditampilkan UI, bukan menghitung ulang dari sumber berbeda.
  const setup = stock.tradePlan
    ? { cl1: stock.tradePlan.cutLoss, tp1: stock.tradePlan.takeProfit1, tp2: stock.tradePlan.takeProfit2, rr: stock.tradePlan.riskReward }
    : stock.tradeSetup
      ? { cl1: stock.tradeSetup.cl1, tp1: stock.tradeSetup.tp1, tp2: stock.tradeSetup.tp2, rr: stock.tradeSetup.rr }
      : null;
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
  // Portfolio diversification is enforced against official IDX-IC only. Missing
  // classification is data-quality failure, never silently replaced by Yahoo taxonomy.
  const officialSectorAvailable = Boolean(input.sector?.trim());
  const dataQualityOk = coverageOk && eligible && categoryKnown && breakdownAvailable && officialSectorAvailable;

  let action: DecisionAction = 'HOLD';
  const opposingReasons: string[] = [];
  const invalidationReasons: string[] = [];

  if (!dataQualityOk) {
    action = 'NO_SIGNAL';
    invalidationReasons.push('Kualitas atau kelayakan data belum memenuhi gerbang internal.');
    if (!officialSectorAvailable) invalidationReasons.push('Klasifikasi sektor resmi IDX-IC belum tersedia.');
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
    sector: input.sector?.trim() || null,
    avgValue20d: finite(stock.avgValue20d) && stock.avgValue20d > 0 ? stock.avgValue20d : null,
    riskSetup: setup,
    news,
    supportingReasons: (stock.topReasons ?? []).slice(0, 3),
    opposingReasons,
    invalidationReasons,
    eligibilityReasons: stock.eligibilityReasons ?? [],
    hybridStatus: 'NOT_REVIEWED',
    hybridReview: null,
    version: DECISION_AGENT_VERSION,
  };
}
