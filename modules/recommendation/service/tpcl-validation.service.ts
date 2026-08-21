import { pool } from '@/shared/database/postgres.client';
import { ensureSharedSchema } from '@/shared/database/schema.service';
import { fetchYahooHistoryDirect, wilderAtrAt, ATR_PERIOD } from '@/modules/technical';
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
import { LENS_SCORE_MODEL_METADATA } from '@/modules/technical/config/lens-score-model';
import { ACTIVE_LIQUID_UNIVERSE_VERSION } from '@/modules/market/constants/ai-pick-universe';
import { MIN_VALIDATION_COVERAGE_PCT } from '@/modules/lens-radar/service/validation-population';
import {
  buildLongTradingSetup,
  DEFAULT_TRADING_SETUP_PARAMETERS,
  STRUCTURE_LOOKBACK_BARS,
  type TradingSetupParameters,
} from './trading-setup';

const SIGNAL_SCORE_THRESHOLD = 80;
// ATR_PERIOD & STRUCTURE_LOOKBACK_BARS kini berasal dari sumber bersama yang SAMA dengan
// produksi (modules/technical/service/atr.ts & trading-setup.ts). Sebelumnya keduanya
// konstanta lokal di file ini, dan itulah yang membuat lab bisa diam-diam mengukur setup
// yang berbeda dari yang dikirim ke pengguna (temuan C-01).
const STRUCTURE_LOOKBACK = STRUCTURE_LOOKBACK_BARS;
const HOLDING_DAYS = 20;
const FETCH_BATCH = 10;
const MIN_METRIC_SAMPLES = 30;
const TPCL_BOOTSTRAP_ITERATIONS = 1000;

// PEMBEKUAN ULANG 2026-08-12 (temuan C-01). Freeze sebelumnya 2026-08-07 mengukur setup
// yang dibangun dari ATR Wilder dan jendela struktur 60 bar, sementara produksi mengirim
// setup dari ATR rata-rata sederhana (~10% lebih kecil) dan jendela struktur penuh. Sampel
// forward lama karena itu mengukur strategi yang tidak pernah dikirim ke pengguna dan
// TIDAK dibawa ke protocol ini.
const TPCL_OOS_FREEZE_DATE = '2026-08-12' as const;
const TPCL_FROZEN_PARAMETER_VERSION = 'tpcl-production-v1.1.0' as const;
const TPCL_OOS_MIN_EXECUTABLE_SAMPLES = 30;
// Nomor protocol ditulis SEKALI di sini lalu dirujuk lewat `typeof` di tipe & keluaran.
// Sebelumnya string yang sama muncul sebagai literal di tipe DAN di objek yang
// dikembalikan - dua tempat yang harus diingat untuk diubah bersamaan, dan itu persis
// bentuk kegagalan diam-diam yang sudah berkali-kali muncul di basis kode ini.
// FASE 2 (2026-08-12): populasi sinyal yang diukur berubah - kini lewat gerbang
// kelengkapan data + kelayakan point-in-time yang sama dengan produksi (temuan H-01),
// dan porsi hasil yang bergantung tie-break TP/SL ikut dilaporkan (temuan H-07).
//
// Tanggal freeze TIDAK diulang: protocol v1.1 dibekukan pada 2026-08-12 dan belum ada
// satu pun sampel forward yang matang di bawahnya, jadi tidak ada yang bisa terlanjur
// terlihat hasilnya. Yang naik hanya nomor protocolnya, supaya dua populasi berbeda
// tidak pernah tercatat di bawah nomor yang sama.
const TPCL_OOS_PROTOCOL_VERSION = 'tpcl-oos-v1.2' as const;
const TPCL_LAB_PROTOCOL_VERSION = 'tpcl-lab-v1.4' as const;


export type TpclOutcome = 'TP1' | 'SL' | 'TIME_EXIT';

/**
 * Bagaimana bar yang menyentuh TP DAN SL sekaligus diselesaikan.
 *
 * Daily OHLC tidak menyimpan urutan intraday, jadi bar yang high-nya mencapai TP dan
 * low-nya menembus SL punya DUA hasil yang sama-sama mungkin. Produksi memakai
 * 'SL_FIRST' (konservatif). Yang ditambahkan di sini (temuan H-07 audit kuantitatif
 * 2026-08-11) adalah kemampuan menjalankan skenario tandingannya: tanpa itu, tidak ada
 * yang tahu apakah 2% atau 40% hasil lab ditentukan oleh asumsi tie-break, dan sebuah
 * asumsi yang tidak terukur pengaruhnya bukan asumsi yang terdokumentasi - ia cuma
 * asumsi yang tertulis.
 */
export type TpclAmbiguityRule = 'SL_FIRST' | 'TP_FIRST';
export type MarketRegime = 'BULL' | 'SIDEWAYS' | 'BEAR' | 'UNKNOWN';
export type ValidationSplit = 'TRAIN' | 'VALIDATION' | 'HOLDOUT';
export type TpclHistoryRange = '1y' | '3y' | '5y' | '10y';

export const DEFAULT_TPCL_HISTORY_RANGE: TpclHistoryRange = '5y';
export const TPCL_HISTORY_RANGES: readonly TpclHistoryRange[] = ['1y', '3y', '5y', '10y'] as const;

const TPCL_HISTORY_RANGE_YEARS: Record<TpclHistoryRange, number> = {
  '1y': 1,
  '3y': 3,
  '5y': 5,
  '10y': 10,
};

type TpclYahooFetchRange = '2y' | '5y' | '10y';

/**
 * Jendela observasi tetap 1/3/5/10 tahun (difilter di readSignals). Untuk 1y dan 3y
 * kita mengambil OHLC sedikit lebih panjang sebagai warm-up ATR/structure. Ini juga
 * menghindari mengirim `3y` ke Yahoo Chart karena range itu bukan range native Yahoo.
 */
function yahooFetchRangeFor(historyRange: TpclHistoryRange): TpclYahooFetchRange {
  if (historyRange === '1y') return '2y';
  if (historyRange === '3y') return '5y';
  return historyRange;
}

export function isTpclHistoryRange(value: unknown): value is TpclHistoryRange {
  return typeof value === 'string' && (TPCL_HISTORY_RANGES as readonly string[]).includes(value);
}

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
  /** true kalau trade ini melewati bar yang menyentuh TP1 dan SL pada bar yang SAMA,
   * sehingga hasilnya ditentukan aturan tie-break, bukan oleh data (temuan H-07). */
  ambiguousBar: boolean;
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
  /** Deterministic calendar-week block bootstrap CI for mean net return. */
  expectancyCi95LowPct: number | null;
  expectancyCi95HighPct: number | null;
  expectancyBootstrapIterations: number;
  profitFactor: number | null;
  avgMaePct: number | null;
  p95MaePct: number | null;
  avgMfePct: number | null;
  avgDaysHeld: number | null;
  medianDaysToTp1: number | null;
  /** Berapa trade yang hasilnya ditentukan aturan tie-break TP/SL, bukan oleh data
   * (temuan H-07). Angka ini adalah batas atas ketidakpastian metrik di atasnya. */
  ambiguousTrades: number;
  ambiguousSharePct: number | null;
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

export type TpclRobustnessStatus =
  | 'ROBUST'
  | 'INCONCLUSIVE_VALIDATION'
  | 'NEGATIVE_VALIDATION'
  | 'INSUFFICIENT_DATA';


export type TpclOosStatus =
  | 'WAITING_FOR_MATURITY'
  | 'INSUFFICIENT_DATA'
  | 'POSITIVE'
  | 'NEGATIVE';

export interface TpclOosProtocolResult {
  protocolId: 'ALL_BASELINE' | 'EXCLUDE_BEAR';
  label: string;
  status: TpclOosStatus;
  eligibleSignalsAfterFreeze: number;
  matureSignals: number;
  executableTrades: number;
  metrics: TpclMetrics;
  note: string;
}

export interface TpclForwardOos {
  protocolVersion: typeof TPCL_OOS_PROTOCOL_VERSION;
  freezeDate: typeof TPCL_OOS_FREEZE_DATE;
  frozenParameterVersion: typeof TPCL_FROZEN_PARAMETER_VERSION;
  frozenParameters: TradingSetupParameters;
  parameterFingerprint: string;
  minimumExecutableSamples: number;
  historyBackfillAllowed: false;
  statusExplanation: string;
  allBaseline: TpclOosProtocolResult;
  excludeBear: TpclOosProtocolResult;
}

export interface TpclEligibilityFunnel {
  rawSignals: number;
  immatureT20: number;
  missingPriceSeries: number;
  insufficientLookback: number;
  corporateActionRisk: number;
  setupRejected: number;
  h1GapRejected: number;
  executable: number;
}

/**
 * Rentang ketidakpastian yang berasal dari asumsi tie-break TP/SL (temuan H-07).
 *
 * `slFirst` adalah angka produksi (konservatif). `tpFirst` adalah batas atas: hasil kalau
 * SETIAP bar ambigu diselesaikan menguntungkan. Selisih keduanya adalah seberapa besar
 * kesimpulan lab bergantung pada asumsi, bukan pada data.
 */
export interface TpclAmbiguityDiagnostic {
  ambiguousTrades: number;
  ambiguousSharePct: number | null;
  slFirst: TpclMetrics;
  tpFirst: TpclMetrics;
  expectancySpreadPct: number | null;
  winRateSpreadPct: number | null;
  note: string;
}

export interface BearFilterDiagnostic {
  baselineAll: TpclMetrics;
  excludeBear: TpclMetrics;
  bearOnly: TpclMetrics;
  excludedTrades: number;
  note: string;
}

export interface TpclValidationDashboard {
  protocolVersion: typeof TPCL_LAB_PROTOCOL_VERSION;
  historyRange: TpclHistoryRange;
  researchOnly: true;
  genuineOos: false;
  scoreVersion: string;
  priceBasis: typeof TRADING_PRICE_BASIS;
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
  robustnessStatus: TpclRobustnessStatus;
  robustnessReasons: string[];
  eligibilityFunnel: TpclEligibilityFunnel;
  ambiguityDiagnostic: TpclAmbiguityDiagnostic;
  bearFilterDiagnostic: BearFilterDiagnostic;
  forwardOos: TpclForwardOos;
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

function calendarWeekKey(dateKeyValue: string): string {
  const match = dateKeyValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateKeyValue;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashTpclRows(rows: TpclTradeObservation[]): number {
  let h = 2166136261 >>> 0;
  const canonical = [...rows].sort((a, b) =>
    a.signalDate.localeCompare(b.signalDate) || a.ticker.localeCompare(b.ticker) || a.netReturnPct - b.netReturnPct,
  );
  for (const row of canonical) {
    const text = `${row.signalDate}|${row.ticker}|${row.netReturnPct.toFixed(8)}`;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
  }
  return h >>> 0;
}

function percentileInterpolated(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo] ?? null;
  const w = index - lo;
  return (sorted[lo] ?? 0) * (1 - w) + (sorted[hi] ?? 0) * w;
}

/**
 * Deterministic calendar-week block bootstrap for TP/CL expectancy.
 *
 * We resample time blocks instead of individual trades because trades generated in the
 * same market week are not independent observations. This replaces audit M-5's fixed
 * ">2 percentage-point spread" heuristic with an uncertainty interval tied to the
 * observed sample. The helper is exported solely so the statistical gate has a direct
 * regression test independent of DB/network state.
 */
export function bootstrapTpclExpectancyCi95(
  rows: TpclTradeObservation[],
  iterations = TPCL_BOOTSTRAP_ITERATIONS,
): { lowPct: number | null; highPct: number | null; iterations: number } {
  const validRows = rows.filter((row) => Number.isFinite(row.netReturnPct));
  if (validRows.length < MIN_METRIC_SAMPLES || iterations <= 0) {
    return { lowPct: null, highPct: null, iterations: 0 };
  }

  const grouped = new Map<string, number[]>();
  for (const row of validRows) {
    const key = calendarWeekKey(row.signalDate);
    const block = grouped.get(key) ?? [];
    block.push(row.netReturnPct);
    grouped.set(key, block);
  }
  const blocks = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, values]) => values);
  if (blocks.length < 2) return { lowPct: null, highPct: null, iterations: 0 };

  const rng = mulberry32((hashTpclRows(validRows) ^ 0x5450434c) >>> 0);
  const draws: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    let count = 0;
    for (let j = 0; j < blocks.length; j++) {
      const block = blocks[Math.floor(rng() * blocks.length)] ?? [];
      for (const value of block) {
        sum += value;
        count++;
      }
    }
    if (count > 0) draws.push(sum / count);
  }
  draws.sort((a, b) => a - b);
  return {
    lowPct: round(percentileInterpolated(draws, 0.025)),
    highPct: round(percentileInterpolated(draws, 0.975)),
    iterations: draws.length,
  };
}

function metrics(rows: TpclTradeObservation[]): TpclMetrics {
  const returns = rows.map((r) => r.netReturnPct);
  const expectancyCi = bootstrapTpclExpectancyCi95(rows);
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
    expectancyCi95LowPct: expectancyCi.lowPct,
    expectancyCi95HighPct: expectancyCi.highPct,
    expectancyBootstrapIterations: expectancyCi.iterations,
    profitFactor: round(profitFactor(returns), 3),
    avgMaePct: round(average(maes)),
    p95MaePct: round(percentile(maes, 0.05)),
    avgMfePct: round(average(mfes)),
    avgDaysHeld: round(average(days), 1),
    medianDaysToTp1: round(median(tpDays), 1),
    ambiguousTrades: rows.filter((r) => r.ambiguousBar).length,
    ambiguousSharePct: rows.length ? round(rows.filter((r) => r.ambiguousBar).length / rows.length * 100) : null,
    sufficient: rows.length >= MIN_METRIC_SAMPLES,
  };
}

// BUG FIX (audit kuantitatif 2026-08-11, temuan C-01): salinan lokal Wilder ATR di sini
// DIHAPUS dan diganti implementasi bersama modules/technical/service/atr.ts - yang sama
// persis dipakai produksi. Selama keduanya hidup terpisah, lab ini mengukur setup dengan
// ATR Wilder sementara produksi mengirim setup dengan ATR rata-rata sederhana yang ~10%
// lebih kecil, sehingga seluruh metrik di bawah milik strategi yang berbeda.

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


type BaselineEligibility = 'EXECUTABLE' | 'SETUP_REJECTED' | 'H1_GAP_REJECTED';

function classifyBaselineEligibility(
  bars: SelectedPriceBar[],
  signalIndex: number,
): BaselineEligibility {
  const signal = bars[signalIndex];
  const entryBar = bars[signalIndex + 1];
  if (!signal || !entryBar) return 'SETUP_REJECTED';

  const atr = wilderAtrAt(bars, signalIndex);
  if (atr == null) return 'SETUP_REJECTED';

  const lookbackStart = Math.max(0, signalIndex - STRUCTURE_LOOKBACK + 1);
  const setupHistory = bars.slice(lookbackStart, signalIndex + 1).map((bar) => ({
    High: bar.high, Low: bar.low, Close: bar.close,
  }));
  const setup = buildLongTradingSetup(
    setupHistory,
    signal.close,
    atr,
    DEFAULT_TRADING_SETUP_PARAMETERS,
  );
  if (!setup) return 'SETUP_REJECTED';

  if (!(entryBar.open > setup.stop && entryBar.open < setup.tp1)) return 'H1_GAP_REJECTED';
  return 'EXECUTABLE';
}

// Diekspor untuk test: aturan tie-break TP/SL adalah cabang di jalur uang yang hasilnya
// tidak bisa diperiksa lewat dashboard tanpa database + jaringan (temuan H-07).
export function simulateTrade(
  bars: SelectedPriceBar[],
  signalIndex: number,
  parameters: TpclParameterSet,
  split: ValidationSplit,
  regime: MarketRegime,
  ticker: string,
  ambiguityRule: TpclAmbiguityRule = 'SL_FIRST',
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
  let ambiguousBar = false;

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
    // Daily OHLC tidak menyimpan urutan intraday. Bar yang menyentuh keduanya punya dua
    // hasil yang sama-sama mungkin; mana yang dipilih ditentukan `ambiguityRule`, dan
    // trade-nya DITANDAI supaya porsinya bisa dilaporkan (temuan H-07).
    if (hitSl && hitTp) ambiguousBar = true;

    if (hitSl && (!hitTp || ambiguityRule === 'SL_FIRST')) {
      outcome = 'SL'; exitPrice = setup.stop; exitDate = bar.date; daysHeld = d; daysToSl = d; break;
    }
    // Hanya catat TP2 sebagai MFE reach bila stop tidak tersentuh pada bar yang sama.
    if (!hitSl && bar.high >= setup.tp2) tp2Reached = true;
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
    ambiguousBar,
  };
}



/**
 * Sidik jari setup yang dibekukan protocol forward-OOS.
 *
 * BUG FIX (audit kuantitatif 2026-08-11, temuan C-01): fingerprint ini dulu HANYA
 * mem-hash enam parameter numerik (buffer/stop/RR/TP). Padahal setup yang benar-benar
 * dihasilkan juga ditentukan oleh METODE ATR dan PANJANG JENDELA STRUKTUR - dan justru
 * kedua hal itulah yang berbeda antara produksi dan lab tanpa terdeteksi siapa pun selama
 * berbulan-bulan. Fingerprint yang tidak berubah saat setup berubah bukan sekadar tidak
 * berguna: ia memberi keyakinan palsu bahwa dua kumpulan sampel forward boleh digabung.
 *
 * Sekarang metode ATR dan jendela struktur ikut di-hash. Kalau salah satunya diganti,
 * fingerprint berubah, dan perbedaan protocol menjadi terlihat di layar.
 */
const ATR_METHOD = `wilder-${ATR_PERIOD}` as const;

function frozenParameterFingerprint(parameters: TradingSetupParameters): string {
  const canonical = [
    parameters.supportBufferAtr,
    parameters.minStopDistanceAtr,
    parameters.fallbackStopAtr,
    parameters.minLongRr,
    parameters.tp1R,
    parameters.tp2R,
  ].map((v) => Number(v).toFixed(6))
    .concat(ATR_METHOD, `structure-${STRUCTURE_LOOKBACK_BARS}`)
    .join('|');

  // Small deterministic non-cryptographic hash for audit display.
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `tpcl-${hash.toString(16).padStart(8, '0')}`;
}

function oosStatus(
  eligibleSignalsAfterFreeze: number,
  matureSignals: number,
  executableRows: TpclTradeObservation[],
): { status: TpclOosStatus; explanation: string } {
  if (eligibleSignalsAfterFreeze === 0 || matureSignals === 0) {
    return {
      status: 'WAITING_FOR_MATURITY',
      explanation: 'Belum ada sinyal setelah freeze yang memiliki horizon T+20 matang.',
    };
  }

  if (executableRows.length < TPCL_OOS_MIN_EXECUTABLE_SAMPLES) {
    return {
      status: 'INSUFFICIENT_DATA',
      explanation: `Sudah ada data matang, tetapi baru ${executableRows.length} trade executable; minimum ${TPCL_OOS_MIN_EXECUTABLE_SAMPLES}.`,
    };
  }

  const m = metrics(executableRows);
  const statisticallyPositive = m.expectancyCi95LowPct != null && m.expectancyCi95LowPct > 0;
  const positive = statisticallyPositive && (m.profitFactor ?? 0) > 1;
  return positive
    ? {
        status: 'POSITIVE',
        explanation: 'Forward sample memenuhi minimum N, batas bawah bootstrap CI 95% expectancy > 0, dan PF > 1. Status ini tidak mempromosikan production secara otomatis.',
      }
    : {
        status: 'NEGATIVE',
        explanation: 'Forward sample memenuhi minimum N tetapi bukti belum lolos gate bootstrap CI 95% expectancy > 0 dan PF > 1.',
      };
}

function deriveRobustnessStatus(baseline: TpclCandidateResult): {
  status: TpclRobustnessStatus;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (!baseline.validation.sufficient || !baseline.holdout.sufficient) {
    reasons.push('Validation/Holdout belum memenuhi minimum sample gate.');
    return { status: 'INSUFFICIENT_DATA', reasons };
  }

  const valExp = baseline.validation.expectancyPct;
  const holdExp = baseline.holdout.expectancyPct;
  const valPf = baseline.validation.profitFactor;
  const holdPf = baseline.holdout.profitFactor;
  const valCiLow = baseline.validation.expectancyCi95LowPct;
  const holdCiLow = baseline.holdout.expectancyCi95LowPct;

  if (valCiLow == null || holdCiLow == null) {
    reasons.push('Bootstrap CI 95% belum tersedia; butuh sampel yang tersebar di sedikitnya dua minggu kalender.');
    return { status: 'INSUFFICIENT_DATA', reasons };
  }

  if ((valExp ?? 0) <= 0 || (holdExp ?? 0) <= 0 || (valPf ?? 0) < 1 || (holdPf ?? 0) < 1) {
    reasons.push('Expectancy atau Profit Factor negatif/lemah pada Validation/Holdout.');
    return { status: 'NEGATIVE_VALIDATION', reasons };
  }

  if (valCiLow <= 0 || holdCiLow <= 0) {
    reasons.push('Point estimate positif, tetapi bootstrap CI 95% expectancy Validation/Holdout masih menyentuh nol.');
    return { status: 'INCONCLUSIVE_VALIDATION', reasons };
  }

  reasons.push('Validation dan Holdout sama-sama punya bootstrap CI 95% expectancy di atas nol, PF >= 1, dan sample gate terpenuhi.');
  return { status: 'ROBUST', reasons };
}

function historyCutoffDate(historyRange: TpclHistoryRange): string {
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - TPCL_HISTORY_RANGE_YEARS[historyRange]);
  return cutoff.toISOString().slice(0, 10);
}

async function readSignals(historyRange: TpclHistoryRange): Promise<SignalRow[]> {
  await ensureSharedSchema();
  const cutoffDate = historyCutoffDate(historyRange);
  const result = await pool.query(
    // Gerbang yang SAMA dengan produksi (temuan H-01): sinyal yang kelengkapan datanya
    // di bawah ambang rekomendasi, atau yang kelayakan point-in-time-nya bukan ELIGIBLE,
    // tidak pernah dikirim ke pengguna - jadi ia juga tidak boleh ikut membentuk metrik
    // TP/CL yang dipakai membenarkan setup itu.
    `SELECT "date", ticker, lens_score
       FROM lens_radar_history
      WHERE lens_score >= $1
        AND score_version = $2
        AND score_config_hash = $7
        AND universe_version = $6
        AND avg_value_20d >= $3
        AND coverage_pct >= $4
        AND eligibility_status = 'ELIGIBLE'
        AND universe_eligible = TRUE
        AND "date" >= $5
      ORDER BY "date" ASC, ticker ASC`,
    [
      SIGNAL_SCORE_THRESHOLD,
      SCORE_VERSION,
      LENS_BUCKET_MIN_AVG_VALUE_20D_IDR,
      MIN_VALIDATION_COVERAGE_PCT,
      cutoffDate,
      ACTIVE_LIQUID_UNIVERSE_VERSION,
      LENS_SCORE_MODEL_METADATA.configHash,
    ],
  );
  return result.rows.map((row: any) => {
    const date = dateKey(row.date);
    const ticker = typeof row.ticker === 'string' ? row.ticker.trim().toUpperCase() : '';
    const lensScore = finite(row.lens_score);
    return date && ticker && lensScore != null ? { date, ticker, lensScore } : null;
  }).filter((row: SignalRow | null): row is SignalRow => row !== null);
}

async function loadTickerSeries(tickers: string[], yahooFetchRange: TpclYahooFetchRange): Promise<Map<string, {
  normalized: ReturnType<typeof normalizeYahooOhlcRows>;
  bars: SelectedPriceBar[];
}>> {
  const result = new Map<string, { normalized: ReturnType<typeof normalizeYahooOhlcRows>; bars: SelectedPriceBar[] }>();
  for (let i = 0; i < tickers.length; i += FETCH_BATCH) {
    const batch = tickers.slice(i, i + FETCH_BATCH);
    const rows = await Promise.all(batch.map(async (ticker) => {
      try {
        const response = await fetchYahooHistoryDirect(ticker, yahooFetchRange);
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

export async function getTpclValidationDashboard(
  historyRange: TpclHistoryRange = DEFAULT_TPCL_HISTORY_RANGE,
): Promise<TpclValidationDashboard> {
  const signals = await readSignals(historyRange);
  const tickers = Array.from(new Set(signals.map((r) => r.ticker))).sort();
  const yahooFetchRange = yahooFetchRangeFor(historyRange);

  const [seriesMap, ihsgResponse] = await Promise.all([
    loadTickerSeries(tickers, yahooFetchRange),
    fetchYahooHistoryDirect('^JKSE', yahooFetchRange).catch(() => null),
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
  const tpFirstBaselineRows: TpclTradeObservation[] = [];

  // Funnel memakai mutually-exclusive rejection stages sehingga total stage
  // selalu dapat direkonsiliasi kembali ke rawSignals.
  const funnel: TpclEligibilityFunnel = {
    rawSignals: signals.length,
    immatureT20: 0,
    missingPriceSeries: 0,
    insufficientLookback: 0,
    corporateActionRisk: 0,
    setupRejected: 0,
    h1GapRejected: 0,
    executable: 0,
  };

  for (const signal of signals) {
    const series = seriesMap.get(signal.ticker);
    if (!series || !series.bars.length) {
      funnel.missingPriceSeries++;
      continue;
    }

    const signalIndex = series.bars.findIndex((bar) => bar.date === signal.date);
    if (signalIndex < 0) {
      funnel.missingPriceSeries++;
      continue;
    }
    if (signalIndex < STRUCTURE_LOOKBACK - 1) {
      funnel.insufficientLookback++;
      continue;
    }
    if (signalIndex + HOLDING_DAYS >= series.bars.length) {
      funnel.immatureT20++;
      continue;
    }

    const normalizedIndexByDate = new Map(series.normalized.map((bar, idx) => [bar.date, idx]));
    const normalizedSignalIndex = normalizedIndexByDate.get(signal.date);
    if (normalizedSignalIndex == null) {
      funnel.missingPriceSeries++;
      continue;
    }
    if (hasCorporateActionRisk(
      series.normalized,
      Math.max(1, normalizedSignalIndex - STRUCTURE_LOOKBACK),
      Math.min(series.normalized.length - 1, normalizedSignalIndex + HOLDING_DAYS),
    )) {
      funnel.corporateActionRisk++;
      continue;
    }

    const baselineEligibility = classifyBaselineEligibility(series.bars, signalIndex);
    if (baselineEligibility === 'SETUP_REJECTED') {
      funnel.setupRejected++;
      continue;
    }
    if (baselineEligibility === 'H1_GAP_REJECTED') {
      funnel.h1GapRejected++;
      continue;
    }
    funnel.executable++;
  }

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

    // Skenario tandingan HANYA untuk baseline: mengukur seberapa jauh hasil bergeser
    // kalau setiap bar ambigu diselesaikan ke arah TP (temuan H-07).
    const baselineSet = PARAMETER_SETS.find((candidate) => candidate.baseline)!;
    const tpFirst = simulateTrade(series.bars, signalIndex, baselineSet, split, regime, signal.ticker, 'TP_FIRST');
    if (tpFirst) tpFirstBaselineRows.push(tpFirst);
  }

  const results = PARAMETER_SETS.map((p) => candidateResult(p, observationsByCandidate.get(p.id) ?? []));
  const baseline = results.find((r) => r.parameters.baseline) ?? results[0]!;
  const baselineRows = observationsByCandidate.get(baseline.parameters.id) ?? [];
  // Baseline simulator is the final source of executable truth.
  // Invariant should normally match pre-pass classifier exactly.
  funnel.executable = baselineRows.length;


  const forwardSignals = signals.filter((signal) => signal.date > TPCL_OOS_FREEZE_DATE);

  let forwardMatureSignals = 0;
  for (const signal of forwardSignals) {
    const series = seriesMap.get(signal.ticker);
    if (!series || !series.bars.length) continue;
    const signalIndex = series.bars.findIndex((bar) => bar.date === signal.date);
    if (signalIndex >= 0 && signalIndex + HOLDING_DAYS < series.bars.length) forwardMatureSignals++;
  }

  // Baseline observations are generated with the exact frozen production engine.
  // Only rows strictly AFTER the freeze are eligible for genuine forward OOS.
  const forwardBaselineRows = baselineRows.filter((row) => row.signalDate > TPCL_OOS_FREEZE_DATE);
  const forwardExcludeBearRows = forwardBaselineRows.filter((row) => row.regime !== 'BEAR');

  const allOosState = oosStatus(forwardSignals.length, forwardMatureSignals, forwardBaselineRows);
  const excludeBearOosState = oosStatus(forwardSignals.length, forwardMatureSignals, forwardExcludeBearRows);

  const forwardOos: TpclForwardOos = {
    protocolVersion: TPCL_OOS_PROTOCOL_VERSION,
    freezeDate: TPCL_OOS_FREEZE_DATE,
    frozenParameterVersion: TPCL_FROZEN_PARAMETER_VERSION,
    frozenParameters: { ...DEFAULT_TRADING_SETUP_PARAMETERS },
    parameterFingerprint: frozenParameterFingerprint(DEFAULT_TRADING_SETUP_PARAMETERS),
    minimumExecutableSamples: TPCL_OOS_MIN_EXECUTABLE_SAMPLES,
    historyBackfillAllowed: false,
    statusExplanation: allOosState.explanation,
    allBaseline: {
      protocolId: 'ALL_BASELINE',
      label: 'Baseline · semua regime',
      status: allOosState.status,
      eligibleSignalsAfterFreeze: forwardSignals.length,
      matureSignals: forwardMatureSignals,
      executableTrades: forwardBaselineRows.length,
      metrics: metrics(forwardBaselineRows),
      note: 'Genuine forward OOS: hanya signalDate > freezeDate. Histori lama tidak boleh di-backfill.',
    },
    excludeBear: {
      protocolId: 'EXCLUDE_BEAR',
      label: 'Candidate · exclude BEAR',
      status: excludeBearOosState.status,
      eligibleSignalsAfterFreeze: forwardSignals.length,
      matureSignals: forwardMatureSignals,
      executableTrades: forwardExcludeBearRows.length,
      metrics: metrics(forwardExcludeBearRows),
      note: 'Protocol candidate terpisah. Tidak mengubah production filter dan tidak boleh digabung dengan baseline setelah melihat hasil.',
    },
  };

  const slFirstMetrics = metrics(baselineRows);
  const tpFirstMetrics = metrics(tpFirstBaselineRows);
  const ambiguityDiagnostic: TpclAmbiguityDiagnostic = {
    ambiguousTrades: slFirstMetrics.ambiguousTrades,
    ambiguousSharePct: slFirstMetrics.ambiguousSharePct,
    slFirst: slFirstMetrics,
    tpFirst: tpFirstMetrics,
    expectancySpreadPct: slFirstMetrics.expectancyPct != null && tpFirstMetrics.expectancyPct != null
      ? round(tpFirstMetrics.expectancyPct - slFirstMetrics.expectancyPct)
      : null,
    winRateSpreadPct: slFirstMetrics.winRatePct != null && tpFirstMetrics.winRatePct != null
      ? round(tpFirstMetrics.winRatePct - slFirstMetrics.winRatePct)
      : null,
    note: 'Daily OHLC tidak menyimpan urutan intraday. slFirst adalah angka produksi (konservatif); tpFirst adalah batas atas kalau setiap bar ambigu diselesaikan menguntungkan. Selisih keduanya adalah ketidakpastian yang berasal dari asumsi, bukan dari data - baca metrik lain di halaman ini dalam rentang itu.',
  };

  const robustness = deriveRobustnessStatus(baseline);
  const nonBearRows = baselineRows.filter((r) => r.regime !== 'BEAR');
  const bearRows = baselineRows.filter((r) => r.regime === 'BEAR');
  const bearFilterDiagnostic: BearFilterDiagnostic = {
    baselineAll: metrics(baselineRows),
    excludeBear: metrics(nonBearRows),
    bearOnly: metrics(bearRows),
    excludedTrades: bearRows.length,
    note: 'Diagnostic counterfactual saja. Tidak mengubah production dan tidak membuktikan filter BEAR akan robust OOS.',
  };

  return {
    protocolVersion: TPCL_LAB_PROTOCOL_VERSION,
    historyRange,
    researchOnly: true,
    genuineOos: false,
    scoreVersion: SCORE_VERSION,
    priceBasis: TRADING_PRICE_BASIS,
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
    robustnessStatus: robustness.status,
    robustnessReasons: robustness.reasons,
    eligibilityFunnel: funnel,
    ambiguityDiagnostic,
    bearFilterDiagnostic,
    forwardOos,
    guardrails: [
      'Entry memakai open H+1; setup dihitung hanya dari OHLC sampai tanggal sinyal.',
      'Daily bar yang menyentuh TP dan SL sekaligus diasumsikan SL lebih dulu (konservatif); porsinya dihitung dan skenario tandingannya dilaporkan di ambiguityDiagnostic.',
      'Gap melewati stop dieksekusi pada harga open yang lebih buruk.',
      'Window dengan indikasi corporate action ditolak.',
      'Parameter candidate hanya sensitivity research; tidak ada auto-apply ke production.',
      'TRAIN/VALIDATION/HOLDOUT di sini retrospektif, bukan genuine OOS.',
      `Forward OOS dibekukan pada ${TPCL_OOS_FREEZE_DATE}; hanya signalDate setelah freeze yang eligible.`,
      'Histori sebelum freeze tidak pernah di-backfill sebagai OOS.',
      'Protocol ALL_BASELINE dan EXCLUDE_BEAR dilacak terpisah; hasil keduanya tidak boleh dicampur.',
      'Tidak ada auto-apply, auto-filter, atau auto-promotion production berdasarkan hasil OOS.',
      `Minimum ${MIN_METRIC_SAMPLES} observasi untuk menandai metrik sebagai cukup sampel.`,
    ],
  };
}
