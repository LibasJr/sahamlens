import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';
import { fetchYahooHistory } from '@/modules/technical';
import {
  detectCorporateAction,
  normalizeYahooOhlcRows,
  selectPriceSeries,
  TRADING_PRICE_BASIS,
  type SelectedPriceBar,
} from '@/shared/market/price-basis';
import {
  LENS_BUCKET_MIN_AVG_VALUE_20D_IDR,
  LENS_BUCKET_ROUND_TRIP_COST_PCT,
} from '@/modules/lens-radar/service/bucket-backtest.service';
import { SCORE_VERSION } from '@/modules/lens-radar/constants/model-version';
import {
  buildLongTradingSetup,
  DEFAULT_TRADING_SETUP_PARAMETERS,
  type TradingSetupParameters,
} from './trading-setup';

const SIGNAL_SCORE_THRESHOLD = 80;
const ATR_PERIOD = 14;
const STRUCTURE_LOOKBACK = 60;
const HOLDING_DAYS = 20;
const FETCH_BATCH = 10;
const MIN_METRIC_SAMPLES = 30;

export type TpclOutcome = 'TP1' | 'SL' | 'TIME_EXIT';
export type MarketRegime = 'BULL' | 'SIDEWAYS' | 'BEAR' | 'UNKNOWN';
export type ValidationSplit = 'TRAIN' | 'VALIDATION' | 'HOLDOUT';

export interface TpclParameterSet extends TradingSetupParameters {
  id: string;
  label: string;
  baseline: boolean;
}

export interface TpclTradeObservation {
  ticker: string;
  signalDate: string;
  entryDate: string;
  exitDate: string;
  split: ValidationSplit;
  regime: MarketRegime;
  outcome: TpclOutcome;
  netReturnPct: number;
  tp1Hit: boolean;
  tp2Reached: boolean;
  slHit: boolean;
  maePct: number;
  mfePct: number;
  daysHeld: number;
  daysToTp1: number | null;
  daysToSl: number | null;
  riskPct: number;
  riskAtr: number;
  stopSource: 'STRUCTURE_ATR' | 'ATR';
}

export interface TpclMetrics {
  samples: number;
  avgReturnPct: number | null;
  medianReturnPct: number | null;
  winRatePct: number | null;
  tp1HitRatePct: number | null;
  tp2ReachRatePct: number | null;
  slHitRatePct: number | null;
  expectancyPct: number | null;
  profitFactor: number | null;
  avgMaePct: number | null;
  p95MaePct: number | null;
  avgMfePct: number | null;
  avgDaysHeld: number | null;
  medianDaysToTp1: number | null;
  sufficient: boolean;
}

export interface TpclCandidateResult {
  parameters: TpclParameterSet;
  overall: TpclMetrics;
  train: TpclMetrics;
  validation: TpclMetrics;
  holdout: TpclMetrics;
  byRegime: Array<{ regime: MarketRegime; metrics: TpclMetrics }>;
  note: string;
}

export interface TpclValidationDashboard {
  protocolVersion: 'tpcl-lab-v1.0';
  researchOnly: true;
  genuineOos: false;
  scoreVersion: string;
  priceBasis: 'RAW';
  scoreThreshold: number;
  roundTripCostPct: number;
  atrPeriod: number;
  structureLookback: number;
  holdingDays: number;
  rawSignalRows: number;
  usableSignalsBaseline: number;
  firstSignalDate: string | null;
  lastSignalDate: string | null;
  splitDates: { trainEnd: string | null; validationEnd: string | null };
  baseline: TpclCandidateResult;
  candidates: TpclCandidateResult[];
  guardrails: string[];
}

interface SignalRow {
  date: string;
  ticker: string;
  lensScore: number;
}

const PARAMETER_SETS: TpclParameterSet[] = [
  { id: 'PRODUCTION_BASELINE', label: 'Production baseline', baseline: true, ...DEFAULT_TRADING_SETUP_PARAMETERS },
  {
    id: 'TIGHTER_ATR', label: 'Tighter ATR sensitivity', baseline: false,
    supportBufferAtr: 0.15, minStopDistanceAtr: 0.5, fallbackStopAtr: 1.25,
    minLongRr: 1.5, tp1R: 2, tp2R: 3,
  },
  {
    id: 'WIDER_ATR', label: 'Wider ATR sensitivity', baseline: false,
    supportBufferAtr: 0.35, minStopDistanceAtr: 1.0, fallbackStopAtr: 2.0,
    minLongRr: 1.5, tp1R: 2, tp2R: 3,
  },
  {
    id: 'HIGHER_RR', label: 'Higher target sensitivity', baseline: false,
    supportBufferAtr: 0.25, minStopDistanceAtr: 0.75, fallbackStopAtr: 1.5,
    minLongRr: 2.0, tp1R: 2.5, tp2R: 3.5,
  },
];

function dateKey(value: unknown): string | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
  if (typeof value !== 'string') return null;
  const m = value.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}
function finite(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
function average(values: number[]): number | null {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}
function median(values: number[]): number | null {
  if (!values.length) return null;
  const x = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(x.length / 2);
  return x.length % 2 ? x[mid]! : (x[mid - 1]! + x[mid]!) / 2;
}
function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const x = values.slice().sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(x.length * p));
  return x[Math.min(x.length - 1, rank - 1)]!;
}
function round(value: number | null, digits = 2): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
function profitFactor(values: number[]): number | null {
  const grossWin = values.filter((v) => v > 0).reduce((s, v) => s + v, 0);
  const grossLoss = Math.abs(values.filter((v) => v < 0).reduce((s, v) => s + v, 0));
  if (grossLoss === 0) return grossWin > 0 ? Number.POSITIVE_INFINITY : null;
  return grossWin / grossLoss;
}

function metrics(rows: TpclTradeObservation[]): TpclMetrics {
  const returns = rows.map((r) => r.netReturnPct);
  const maes = rows.map((r) => r.maePct);
  const mfes = rows.map((r) => r.mfePct);
  const days = rows.map((r) => r.daysHeld);
  const tpDays = rows.map((r) => r.daysToTp1).filter((v): v is number => v != null);
  return {
    samples: rows.length,
    avgReturnPct: round(average(returns)),
    medianReturnPct: round(median(returns)),
    winRatePct: rows.length ? round(rows.filter((r) => r.netReturnPct > 0).length / rows.length * 100) : null,
    tp1HitRatePct: rows.length ? round(rows.filter((r) => r.tp1Hit).length / rows.length * 100) : null,
    tp2ReachRatePct: rows.length ? round(rows.filter((r) => r.tp2Reached).length / rows.length * 100) : null,
    slHitRatePct: rows.length ? round(rows.filter((r) => r.slHit).length / rows.length * 100) : null,
    expectancyPct: round(average(returns)),
    profitFactor: round(profitFactor(returns), 3),
    avgMaePct: round(average(maes)),
    p95MaePct: round(percentile(maes, 0.05)),
    avgMfePct: round(average(mfes)),
    avgDaysHeld: round(average(days), 1),
    medianDaysToTp1: round(median(tpDays), 1),
    sufficient: rows.length >= MIN_METRIC_SAMPLES,
  };
}

function wilderAtrAt(bars: SelectedPriceBar[], index: number, period = ATR_PERIOD): number | null {
  if (index < period || bars.length <= index) return null;
  const trs: number[] = [];
  for (let i = 1; i <= index; i++) {
    const curr = bars[i];
    const prev = bars[i - 1];
    if (!curr || !prev) continue;
    const tr = Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close));
    if (Number.isFinite(tr) && tr > 0) trs.push(tr);
  }
  if (trs.length < period) return null;
  let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trs.length; i++) atr = ((atr * (period - 1)) + trs[i]!) / period;
  return Number.isFinite(atr) && atr > 0 ? atr : null;
}

function hasCorporateActionRisk(
  normalized: ReturnType<typeof normalizeYahooOhlcRows>,
  fromIndex: number,
  toIndex: number,
): boolean {
  const start = Math.max(1, fromIndex);
  const end = Math.min(normalized.length - 1, toIndex);
  for (let i = start; i <= end; i++) {
    const prev = normalized[i - 1];
    const curr = normalized[i];
    if (prev && curr && detectCorporateAction(prev, curr).suspected) return true;
  }
  return false;
}

function sma(values: number[], length: number): number | null {
  if (values.length < length) return null;
  const slice = values.slice(values.length - length);
  return slice.reduce((s, v) => s + v, 0) / length;
}
function marketRegime(ihsgBars: SelectedPriceBar[], signalDate: string): MarketRegime {
  let idx = -1;
  for (let i = ihsgBars.length - 1; i >= 0; i--) {
    if (ihsgBars[i]!.date <= signalDate) { idx = i; break; }
  }
  if (idx < 50) return 'UNKNOWN';
  const closes = ihsgBars.slice(0, idx + 1).map((b) => b.close);
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const close = closes[closes.length - 1];
  if (ma20 == null || ma50 == null || close == null) return 'UNKNOWN';
  if (close > ma50 && ma20 > ma50 * 1.005) return 'BULL';
  if (close < ma50 && ma20 < ma50 * 0.995) return 'BEAR';
  return 'SIDEWAYS';
}

function splitBoundaries(signals: SignalRow[]): { trainEnd: string | null; validationEnd: string | null } {
  const dates = Array.from(new Set(signals.map((r) => r.date))).sort();
  if (dates.length < 5) return { trainEnd: null, validationEnd: null };
  const trainIdx = Math.max(0, Math.floor(dates.length * 0.60) - 1);
  const valIdx = Math.max(trainIdx + 1, Math.floor(dates.length * 0.80) - 1);
  return {
    trainEnd: dates[Math.min(dates.length - 1, trainIdx)] ?? null,
    validationEnd: dates[Math.min(dates.length - 1, valIdx)] ?? null,
  };
}
function splitForDate(date: string, boundaries: { trainEnd: string | null; validationEnd: string | null }): ValidationSplit {
  if (!boundaries.trainEnd || !boundaries.validationEnd) return 'TRAIN';
  if (date <= boundaries.trainEnd) return 'TRAIN';
  if (date <= boundaries.validationEnd) return 'VALIDATION';
  return 'HOLDOUT';
}

function simulateTrade(
  bars: SelectedPriceBar[],
  signalIndex: number,
  parameters: TpclParameterSet,
  split: ValidationSplit,
  regime: MarketRegime,
  ticker: string,
): TpclTradeObservation | null {
  const signal = bars[signalIndex];
  const entryBar = bars[signalIndex + 1];
  const finalBar = bars[signalIndex + HOLDING_DAYS];
  if (!signal || !entryBar || !finalBar) return null;

  const atr = wilderAtrAt(bars, signalIndex);
  if (atr == null) return null;

  const lookbackStart = Math.max(0, signalIndex - STRUCTURE_LOOKBACK + 1);
  const setupHistory = bars.slice(lookbackStart, signalIndex + 1).map((bar) => ({
    High: bar.high, Low: bar.low, Close: bar.close,
  }));
  const setup = buildLongTradingSetup(setupHistory, signal.close, atr, parameters);
  if (!setup) return null;

  const actualEntry = entryBar.open;
  // Gap H+1 sudah invalid/di atas target => tidak membuka trade.
  if (!(actualEntry > setup.stop && actualEntry < setup.tp1)) return null;

  let minLow = actualEntry;
  let maxHigh = actualEntry;
  let outcome: TpclOutcome = 'TIME_EXIT';
  let exitPrice = finalBar.close;
  let exitDate = finalBar.date;
  let daysHeld = HOLDING_DAYS;
  let daysToTp1: number | null = null;
  let daysToSl: number | null = null;
  let tp2Reached = false;

  for (let d = 1; d <= HOLDING_DAYS; d++) {
    const bar = bars[signalIndex + d];
    if (!bar) return null;
    minLow = Math.min(minLow, bar.low);
    maxHigh = Math.max(maxHigh, bar.high);

    if (bar.open <= setup.stop) {
      outcome = 'SL'; exitPrice = bar.open; exitDate = bar.date; daysHeld = d; daysToSl = d; break;
    }

    const hitSl = bar.low <= setup.stop;
    const hitTp = bar.high >= setup.tp1;
    // Ambiguitas daily bar: konservatif, SL lebih dulu.
    if (hitSl) {
      outcome = 'SL'; exitPrice = setup.stop; exitDate = bar.date; daysHeld = d; daysToSl = d; break;
    }
    // Hanya catat TP2 sebagai MFE reach bila stop tidak tersentuh pada bar yang sama.
    if (bar.high >= setup.tp2) tp2Reached = true;
    if (hitTp) {
      outcome = 'TP1'; exitPrice = setup.tp1; exitDate = bar.date; daysHeld = d; daysToTp1 = d; break;
    }
  }

  return {
    ticker,
    signalDate: signal.date,
    entryDate: entryBar.date,
    exitDate,
    split,
    regime,
    outcome,
    netReturnPct: ((exitPrice / actualEntry) - 1) * 100 - LENS_BUCKET_ROUND_TRIP_COST_PCT,
    tp1Hit: outcome === 'TP1',
    tp2Reached,
    slHit: outcome === 'SL',
    maePct: ((minLow / actualEntry) - 1) * 100,
    mfePct: ((maxHigh / actualEntry) - 1) * 100,
    daysHeld,
    daysToTp1,
    daysToSl,
    riskPct: setup.riskPct,
    riskAtr: setup.riskAtr,
    stopSource: setup.stopSource,
  };
}

async function readSignals(): Promise<SignalRow[]> {
  await ensureSharedSchema();
  const result = await pool.query(
    `SELECT "date", ticker, lens_score
       FROM lens_radar_history
      WHERE lens_score >= $1
        AND score_version = $2
        AND avg_value_20d >= $3
      ORDER BY "date" ASC, ticker ASC`,
    [SIGNAL_SCORE_THRESHOLD, SCORE_VERSION, LENS_BUCKET_MIN_AVG_VALUE_20D_IDR],
  );
  return result.rows.map((row: any) => {
    const date = dateKey(row.date);
    const ticker = typeof row.ticker === 'string' ? row.ticker.trim().toUpperCase() : '';
    const lensScore = finite(row.lens_score);
    return date && ticker && lensScore != null ? { date, ticker, lensScore } : null;
  }).filter((row: SignalRow | null): row is SignalRow => row !== null);
}

async function loadTickerSeries(tickers: string[]): Promise<Map<string, {
  normalized: ReturnType<typeof normalizeYahooOhlcRows>;
  bars: SelectedPriceBar[];
}>> {
  const result = new Map<string, { normalized: ReturnType<typeof normalizeYahooOhlcRows>; bars: SelectedPriceBar[] }>();
  for (let i = 0; i < tickers.length; i += FETCH_BATCH) {
    const batch = tickers.slice(i, i + FETCH_BATCH);
    const rows = await Promise.all(batch.map(async (ticker) => {
      try {
        const response = await fetchYahooHistory(ticker, '5y');
        const normalized = normalizeYahooOhlcRows(
          response?.history ?? [], ticker,
          response?.regularMarketTime ? new Date(response.regularMarketTime * 1000).toISOString() : null,
        );
        return { ticker, normalized, bars: selectPriceSeries(normalized, TRADING_PRICE_BASIS).bars };
      } catch {
        return { ticker, normalized: [] as ReturnType<typeof normalizeYahooOhlcRows>, bars: [] as SelectedPriceBar[] };
      }
    }));
    for (const row of rows) result.set(row.ticker, { normalized: row.normalized, bars: row.bars });
  }
  return result;
}

function candidateResult(parameters: TpclParameterSet, observations: TpclTradeObservation[]): TpclCandidateResult {
  const regimes: MarketRegime[] = ['BULL', 'SIDEWAYS', 'BEAR', 'UNKNOWN'];
  return {
    parameters,
    overall: metrics(observations),
    train: metrics(observations.filter((r) => r.split === 'TRAIN')),
    validation: metrics(observations.filter((r) => r.split === 'VALIDATION')),
    holdout: metrics(observations.filter((r) => r.split === 'HOLDOUT')),
    byRegime: regimes.map((regime) => ({ regime, metrics: metrics(observations.filter((r) => r.regime === regime)) })),
    note: parameters.baseline
      ? 'Baseline production. Validation Lab tidak mengubah parameter ini.'
      : 'Sensitivity candidate saja; tidak eligible auto-apply ke production.',
  };
}

export async function getTpclValidationDashboard(): Promise<TpclValidationDashboard> {
  const signals = await readSignals();
  const tickers = Array.from(new Set(signals.map((r) => r.ticker))).sort();

  const [seriesMap, ihsgResponse] = await Promise.all([
    loadTickerSeries(tickers),
    fetchYahooHistory('^JKSE', '5y').catch(() => null),
  ]);

  const ihsgNormalized = normalizeYahooOhlcRows(
    ihsgResponse?.history ?? [], '^JKSE',
    ihsgResponse?.regularMarketTime ? new Date(ihsgResponse.regularMarketTime * 1000).toISOString() : null,
  );
  const ihsgBars = selectPriceSeries(ihsgNormalized, TRADING_PRICE_BASIS).bars;

  // Split hanya memakai sinyal yang sudah punya horizon T+20 matang. Kalau tanggal
  // terbaru yang belum matang ikut menentukan batas 60/20/20, HOLDOUT akan tampak
  // kosong hanya karena masa depan belum tersedia.
  const matureSignals = signals.filter((signal) => {
    const series = seriesMap.get(signal.ticker);
    if (!series || !series.bars.length) return false;
    const signalIndex = series.bars.findIndex((bar) => bar.date === signal.date);
    return signalIndex >= STRUCTURE_LOOKBACK - 1 && signalIndex + HOLDING_DAYS < series.bars.length;
  });
  const boundaries = splitBoundaries(matureSignals);

  const observationsByCandidate = new Map<string, TpclTradeObservation[]>();
  for (const candidate of PARAMETER_SETS) observationsByCandidate.set(candidate.id, []);

  for (const signal of matureSignals) {
    const series = seriesMap.get(signal.ticker);
    if (!series || !series.bars.length) continue;
    const signalIndex = series.bars.findIndex((bar) => bar.date === signal.date);
    if (signalIndex < STRUCTURE_LOOKBACK - 1 || signalIndex + HOLDING_DAYS >= series.bars.length) continue;

    const normalizedIndexByDate = new Map(series.normalized.map((bar, idx) => [bar.date, idx]));
    const normalizedSignalIndex = normalizedIndexByDate.get(signal.date);
    if (normalizedSignalIndex == null) continue;
    if (hasCorporateActionRisk(
      series.normalized,
      Math.max(1, normalizedSignalIndex - STRUCTURE_LOOKBACK),
      Math.min(series.normalized.length - 1, normalizedSignalIndex + HOLDING_DAYS),
    )) continue;

    const split = splitForDate(signal.date, boundaries);
    const regime = marketRegime(ihsgBars, signal.date);

    for (const candidate of PARAMETER_SETS) {
      const obs = simulateTrade(series.bars, signalIndex, candidate, split, regime, signal.ticker);
      if (obs) observationsByCandidate.get(candidate.id)!.push(obs);
    }
  }

  const results = PARAMETER_SETS.map((p) => candidateResult(p, observationsByCandidate.get(p.id) ?? []));
  const baseline = results.find((r) => r.parameters.baseline) ?? results[0]!;
  const baselineRows = observationsByCandidate.get(baseline.parameters.id) ?? [];

  return {
    protocolVersion: 'tpcl-lab-v1.0',
    researchOnly: true,
    genuineOos: false,
    scoreVersion: SCORE_VERSION,
    priceBasis: 'RAW',
    scoreThreshold: SIGNAL_SCORE_THRESHOLD,
    roundTripCostPct: LENS_BUCKET_ROUND_TRIP_COST_PCT,
    atrPeriod: ATR_PERIOD,
    structureLookback: STRUCTURE_LOOKBACK,
    holdingDays: HOLDING_DAYS,
    rawSignalRows: signals.length,
    usableSignalsBaseline: baselineRows.length,
    firstSignalDate: signals[0]?.date ?? null,
    lastSignalDate: signals[signals.length - 1]?.date ?? null,
    splitDates: boundaries,
    baseline,
    candidates: results,
    guardrails: [
      'Entry memakai open H+1; setup dihitung hanya dari OHLC sampai tanggal sinyal.',
      'Daily bar yang menyentuh TP dan SL sekaligus diasumsikan SL lebih dulu (konservatif).',
      'Gap melewati stop dieksekusi pada harga open yang lebih buruk.',
      'Window dengan indikasi corporate action ditolak.',
      'Parameter candidate hanya sensitivity research; tidak ada auto-apply ke production.',
      'TRAIN/VALIDATION/HOLDOUT di sini retrospektif, bukan genuine OOS.',
      `Minimum ${MIN_METRIC_SAMPLES} observasi untuk menandai metrik sebagai cukup sampel.`,
    ],
  };
}
