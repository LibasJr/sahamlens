// Mesin validasi LensIntraday. Semua kerja berat ada di runIntradayValidation()
// (dipanggil worker/aksi admin, hasilnya disimpan sebagai satu baris run), sedangkan
// getIntradayDashboard() hanya membaca ringkasan - halaman admin tidak pernah
// menghitung ulang puluhan ribu baris saat dibuka.
//
// FAIL-CLOSED: tiap gerbang yang gagal MENURUNKAN status dan menambah peringatan.
// Tidak ada angka yang diisi 0 saat sebenarnya null, dan tidak ada status tervalidasi
// yang muncul karena backtest terlihat untung.

import {
  buildReliabilityBins,
  calibrationMetrics,
  fitIsotonic,
  applyIsotonic,
  type CalibrationPair,
} from '@/modules/lens-radar/service/score-calibration.service';
import { fetchYahooHistoryDirect } from '@/modules/technical/service/yahoo-history.service';
import {
  INTRADAY_COST_SCENARIOS,
  INTRADAY_HORIZONS,
  INTRADAY_HORIZON_LABEL,
  INTRADAY_SCORE_BUCKETS,
  MAX_HEALTHY_COMPONENT_SATURATION,
  INTRADAY_COMPONENT_KEYS,
  effectiveSlippageBps,
  minHalfSpreadBps,
  type IdxPriceFractionBand,
  LENS_INTRADAY_MODEL_KEY,
  LENS_INTRADAY_MODEL_NAME,
  LENS_INTRADAY_WEIGHTS,
  MIN_DATA_COMPLETENESS_PCT,
  MIN_DISTINCT_TICKERS,
  MIN_EFFECTIVE_SAMPLE_PER_CELL,
  MIN_EFFECTIVE_SAMPLE_TOTAL,
  MIN_OOS_TRADING_DAYS,
  VALIDATION_ALPHA,
  defaultIntradayRunConfig,
  intradayConfigHash,
  intradayScoreBucket,
  type IntradayCostConfig,
  type IntradayHorizon,
  type IntradayModelStatus,
  type IntradayRunConfig,
} from '../constants/intraday-model';
import { formatWibMinute } from './intraday-bars.service';
import {
  bucketMonotonicity,
  computePerformance,
  concentrationBy,
  correctPValues,
  datasetHash as computeDatasetHash,
  intradayInformationCoefficient,
  mean,
  median,
  purgedWalkForward,
  round,
  toEffectiveSample,
  tradingDayBlockBootstrapMean,
  tradingDayBlockSignFlipTest,
  type ConcentrationResult,
  type CorrectedPValue,
  type IntradayObservation,
  type PerformanceMetrics,
  type WalkForwardResult,
} from './intraday-stats';
import {
  finishValidationRun,
  getActiveOosProtocol,
  getIntradayCoverage,
  getIntradayDataQualitySummary,
  getLatestThresholdProposal,
  getLatestValidationRunResult,
  getLatestWeightProposal,
  listRecentIntradaySamples,
  listValidationRuns,
  loadIntradayObservations,
  startValidationRun,
  type ObservationRow,
  type OosProtocolRow,
} from '../repository/intraday.repository';

// ---------------------------------------------------------------------------
// Bentuk hasil
// ---------------------------------------------------------------------------

export interface HorizonReport {
  horizon: IntradayHorizon;
  label: string;
  samplesRaw: number;
  samplesMature: number;
  samplesEffective: number;
  distinctTickers: number;
  distinctDays: number;
  noFillPct: number | null;
  stopLossPct: number | null;
  takeProfitPct: number | null;
  avgMfe: number | null;
  avgMae: number | null;
  performance: PerformanceMetrics | null;
  bootstrap: ReturnType<typeof tradingDayBlockBootstrapMean> | null;
  permutation: ReturnType<typeof tradingDayBlockSignFlipTest> | null;
  informationCoefficient: ReturnType<typeof intradayInformationCoefficient> | null;
  /**
   * Irisan sinyal yang benar-benar bisa dieksekusi (harga di atas gocap, nilai
   * transaksi sesi memadai, cukup sering bertransaksi). Populasi grid TETAP utuh -
   * ini pembacaan kedua, bukan penyaringan.
   */
  tradableShare: number | null;
  tradablePerformance: PerformanceMetrics | null;
  tradableBootstrap: ReturnType<typeof tradingDayBlockBootstrapMean> | null;
  status: 'INSUFFICIENT_SAMPLE' | 'REPORTED';
  warnings: string[];
}

/** Diagnostik SEBARAN FITUR. Tidak pernah menyentuh net return - lihat catatan di konstanta. */
export interface ComponentDiagnosticRow {
  component: string;
  samples: number;
  meanScore: number | null;
  p05: number | null;
  p50: number | null;
  p95: number | null;
  /** Porsi observasi yang mentok di 0 atau 100 karena rentang pemetaan terlalu sempit. */
  saturatedShare: number | null;
  healthy: boolean;
}

export interface SpreadFloorReport {
  /** Porsi trade yang minimal satu sisinya ditentukan lantai fraksi harga. */
  bindingShare: number | null;
  entryBindingShare: number | null;
  exitBindingShare: number | null;
  medianAppliedSlippageBps: number | null;
  medianEntrySlippageBps: number | null;
  medianExitSlippageBps: number | null;
  maxAppliedSlippageBps: number | null;
  note: string;
}

export interface BucketReport {
  bucket: string;
  samplesRaw: number;
  samplesEffective: number;
  winRate: number | null;
  avgNetReturn: number | null;
  medianNetReturn: number | null;
  profitFactor: number | null;
  ci95Low: number | null;
  ci95High: number | null;
  status: 'INSUFFICIENT_SAMPLE' | 'REPORTED';
}

export interface SliceReport {
  key: string;
  label: string;
  samplesRaw: number;
  samplesEffective: number;
  winRate: number | null;
  avgNetReturn: number | null;
  medianNetReturn: number | null;
  profitFactor: number | null;
  status: 'INSUFFICIENT_SAMPLE' | 'REPORTED';
}

export interface CostSensitivityRow {
  scenario: string;
  label: string;
  costVersion: string;
  avgNetReturn: number | null;
  medianNetReturn: number | null;
  winRate: number | null;
  profitFactor: number | null;
  stillPositive: boolean;
}

export interface CalibrationReport {
  status: 'INSUFFICIENT_SAMPLE' | 'REPORTED';
  samples: number;
  bins: ReturnType<typeof buildReliabilityBins>;
  naive: ReturnType<typeof calibrationMetrics>;
  isotonicOnTest: ReturnType<typeof calibrationMetrics>;
  naiveOnTest: ReturnType<typeof calibrationMetrics>;
  isotonicImprovesOutOfSample: boolean;
  splitDate: string | null;
  rejectedBins: number;
  scoreReadableAsProbability: boolean;
  conclusion: string;
}

export interface AcceptanceCriteria {
  minOosTradingDays: number;
  minDistinctTickers: number;
  minEffectiveSamplesTotal: number;
  minEffectiveSamplesPerHorizon: number;
  minDataCompletenessPct: number;
  alpha: number;
  requirePositiveNetExpectancy: boolean;
  requireCiLowerBoundAboveZero: boolean;
  requireProfitFactorAboveOne: boolean;
  requireMajorityFoldsPositive: boolean;
  maxTop5TickerAbsShare: number;
  requireSurvivesHighSlippage: boolean;
}

export const DEFAULT_ACCEPTANCE_CRITERIA: AcceptanceCriteria = {
  minOosTradingDays: MIN_OOS_TRADING_DAYS,
  minDistinctTickers: MIN_DISTINCT_TICKERS,
  minEffectiveSamplesTotal: MIN_EFFECTIVE_SAMPLE_TOTAL,
  minEffectiveSamplesPerHorizon: MIN_EFFECTIVE_SAMPLE_PER_CELL,
  minDataCompletenessPct: MIN_DATA_COMPLETENESS_PCT,
  alpha: VALIDATION_ALPHA,
  requirePositiveNetExpectancy: true,
  requireCiLowerBoundAboveZero: true,
  requireProfitFactorAboveOne: true,
  requireMajorityFoldsPositive: true,
  maxTop5TickerAbsShare: 0.5,
  requireSurvivesHighSlippage: true,
};

export interface AcceptanceGateItem {
  key: string;
  label: string;
  required: string;
  observed: string;
  passed: boolean;
}

export interface IntradayValidationResult {
  generatedAt: string;
  modelName: string;
  modelKey: string;
  modelVersion: string;
  configHash: string;
  protocolVersion: string | null;
  datasetHash: string | null;
  provider: string;
  barInterval: string;
  timezone: string;
  windowFrom: string | null;
  windowTo: string | null;
  oosMode: boolean;
  freezeTimestamp: string | null;
  sample: {
    raw: number;
    mature: number;
    effective: number;
    distinctTickers: number;
    distinctDays: number;
    truncated: boolean;
  };
  dataQualityGate: { passed: boolean; completenessPct: number | null; minRequired: number; reason: string | null };
  horizons: HorizonReport[];
  buckets: Record<string, BucketReport[]>;
  monotonicity: Record<string, ReturnType<typeof bucketMonotonicity>>;
  timeOfDay: Record<string, SliceReport[]>;
  liquidity: Record<string, SliceReport[]>;
  concentration: { ticker: ConcentrationResult | null; sector: ConcentrationResult | null };
  regime: { definition: string; available: boolean; rows: SliceReport[] };
  calibration: CalibrationReport;
  componentDiagnostics: { rows: ComponentDiagnosticRow[]; note: string };
  spreadFloor: SpreadFloorReport;
  costSensitivity: CostSensitivityRow[];
  walkForward: WalkForwardResult | null;
  multipleTesting: CorrectedPValue[];
  acceptance: { criteria: AcceptanceCriteria; items: AcceptanceGateItem[]; passedAll: boolean; frozen: boolean };
  status: IntradayModelStatus;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Utilitas
// ---------------------------------------------------------------------------

/** Horizon utama untuk gerbang penerimaan dan status keseluruhan. */
export const PRIMARY_HORIZON: IntradayHorizon = 'H30';

function toObservations(rows: ObservationRow[]): IntradayObservation[] {
  return rows
    .filter((r) => r.fillStatus === 'FILLED' && r.netReturn != null && r.grossReturn != null)
    .map((r) => ({
      ticker: r.ticker,
      tradingDate: r.tradingDate,
      signalMinute: r.signalMinute,
      score: r.score,
      netReturn: r.netReturn as number,
      grossReturn: r.grossReturn as number,
      sector: r.sector,
      turnoverIdr: r.turnoverIdr,
    }));
}

function sliceReport(key: string, label: string, observations: IntradayObservation[]): SliceReport {
  const effective = toEffectiveSample(observations);
  const perf = computePerformance(observations, effective);
  return {
    key,
    label,
    samplesRaw: observations.length,
    samplesEffective: effective.effective,
    winRate: perf.winRate,
    avgNetReturn: perf.avgNetReturn,
    medianNetReturn: perf.medianNetReturn,
    profitFactor: perf.profitFactor,
    status: effective.effective < MIN_EFFECTIVE_SAMPLE_PER_CELL ? 'INSUFFICIENT_SAMPLE' : 'REPORTED',
  };
}

function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Sensitivitas biaya - dihitung ulang dari harga MENTAH, tanpa fetch baru
// ---------------------------------------------------------------------------

/**
 * Lantai setengah fraksi harga ikut diterapkan di sini, PERSIS seperti di
 * simulateIntradayOutcome. Kalau tidak, tabel sensitivitas biaya akan melaporkan
 * skenario "slippage rendah" yang secara fisik tidak mungkin terjadi pada saham murah.
 */
export function netReturnUnderCost(
  entryPriceRaw: number,
  exitPriceRaw: number,
  cost: IntradayCostConfig,
  priceFractions?: IdxPriceFractionBand[]
): number {
  const entrySlip = effectiveSlippageBps(entryPriceRaw, cost.slippageEntryBps, priceFractions);
  const exitSlip = effectiveSlippageBps(exitPriceRaw, cost.slippageExitBps, priceFractions);
  const entry = entryPriceRaw * (1 + entrySlip / 10_000) * (1 + cost.buyFeePct / 100);
  const exit = exitPriceRaw * (1 - exitSlip / 10_000) * (1 - cost.sellFeePct / 100);
  return exit / entry - 1;
}

function costSensitivity(rows: ObservationRow[], priceFractions?: IdxPriceFractionBand[]): CostSensitivityRow[] {
  const usable = rows.filter(
    (r) => r.fillStatus === 'FILLED' && r.entryPriceRaw != null && r.exitPriceRaw != null && r.entryPriceRaw > 0
  );
  return Object.entries(INTRADAY_COST_SCENARIOS).map(([scenario, cost]) => {
    const nets = usable.map((r) =>
      netReturnUnderCost(r.entryPriceRaw as number, r.exitPriceRaw as number, cost, priceFractions)
    );
    const wins = nets.filter((n) => n > 0);
    const losses = nets.filter((n) => n <= 0);
    const grossProfit = wins.reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
    const avg = mean(nets);
    return {
      scenario,
      label: cost.label,
      costVersion: cost.version,
      avgNetReturn: round(avg),
      medianNetReturn: round(median(nets)),
      winRate: nets.length ? round(wins.length / nets.length, 4) : null,
      profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 4) : null,
      stillPositive: avg != null && avg > 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Diagnostik sebaran komponen - HANYA fitur, tidak pernah outcome
// ---------------------------------------------------------------------------

export const COMPONENT_DIAGNOSTIC_NOTE =
  'Diagnostik ini membaca SEBARAN KOMPONEN saja dan tidak pernah menyentuh net return. ' +
  'Gunanya menjawab satu pertanyaan yang sah tanpa fitting: apakah rentang pemetaan ' +
  'komponen terlalu sempit, sehingga terlalu banyak observasi mentok di 0/100 dan ' +
  'komponen itu kehilangan daya bedanya. Menyetel rentang sampai WIN RATE membaik adalah ' +
  'hal yang berbeda, dan itu fitting - jangan lakukan.';

function percentileOf(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return round(sorted[lo]!, 2);
  return round(sorted[lo]! * (hi - index) + sorted[hi]! * (index - lo), 2);
}

function buildComponentDiagnostics(rows: ObservationRow[]): { rows: ComponentDiagnosticRow[]; note: string } {
  const withComponents = rows.filter((r) => r.componentScores != null);
  const diagnostics = INTRADAY_COMPONENT_KEYS.map((key) => {
    const values = withComponents
      .map((r) => r.componentScores![key])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const saturated = values.filter((v) => v <= 0 || v >= 100).length;
    const saturatedShare = values.length ? saturated / values.length : null;
    return {
      component: key,
      samples: values.length,
      meanScore: round(mean(values), 2),
      p05: percentileOf(values, 0.05),
      p50: percentileOf(values, 0.5),
      p95: percentileOf(values, 0.95),
      saturatedShare: round(saturatedShare, 4),
      healthy: saturatedShare != null && saturatedShare <= MAX_HEALTHY_COMPONENT_SATURATION,
    };
  });
  return { rows: diagnostics, note: COMPONENT_DIAGNOSTIC_NOTE };
}

// ---------------------------------------------------------------------------
// Lantai spread dari fraksi harga IDX
// ---------------------------------------------------------------------------

function buildSpreadFloorReport(rows: ObservationRow[], config: IntradayRunConfig): SpreadFloorReport {
  const filled = rows.filter(
    (r) => r.fillStatus === 'FILLED' && r.entryPriceRaw != null && r.entryPriceRaw > 0 && r.exitPriceRaw != null && r.exitPriceRaw > 0,
  );
  if (!filled.length) {
    return {
      bindingShare: null,
      entryBindingShare: null,
      exitBindingShare: null,
      medianAppliedSlippageBps: null,
      medianEntrySlippageBps: null,
      medianExitSlippageBps: null,
      maxAppliedSlippageBps: null,
      note: SPREAD_FLOOR_NOTE,
    };
  }
  // Dihitung ulang dari harga entry, bukan mengandalkan kolom yang bisa NULL untuk
  // baris lama - jadi laporan tetap benar untuk data yang diarsipkan sebelum kolomnya ada.
  const entryApplied = filled.map((r) =>
    effectiveSlippageBps(r.entryPriceRaw as number, config.cost.slippageEntryBps, config.priceFractions)
  );
  const exitApplied = filled.map((r) =>
    effectiveSlippageBps(r.exitPriceRaw as number, config.cost.slippageExitBps, config.priceFractions)
  );
  const entryBinding = filled.filter(
    (r) =>
      minHalfSpreadBps(r.entryPriceRaw as number, config.priceFractions) >
      config.cost.slippageEntryBps
  ).length;
  const exitBinding = filled.filter(
    (r) =>
      minHalfSpreadBps(r.exitPriceRaw as number, config.priceFractions) >
      config.cost.slippageExitBps
  ).length;
  const eitherBinding = filled.filter((r) =>
    minHalfSpreadBps(r.entryPriceRaw as number, config.priceFractions) > config.cost.slippageEntryBps ||
    minHalfSpreadBps(r.exitPriceRaw as number, config.priceFractions) > config.cost.slippageExitBps
  ).length;
  return {
    bindingShare: round(eitherBinding / filled.length, 4),
    entryBindingShare: round(entryBinding / filled.length, 4),
    exitBindingShare: round(exitBinding / filled.length, 4),
    // Field lama dipertahankan sebagai median entry supaya hasil run yang tersimpan
    // tetap dapat dibaca, sedangkan sisi exit ditampilkan eksplisit di v0.1.1+.
    medianAppliedSlippageBps: round(median(entryApplied), 2),
    medianEntrySlippageBps: round(median(entryApplied), 2),
    medianExitSlippageBps: round(median(exitApplied), 2),
    maxAppliedSlippageBps: round(Math.max(...entryApplied, ...exitApplied), 2),
    note: SPREAD_FLOOR_NOTE,
  };
}

export const SPREAD_FLOOR_NOTE =
  'Provider ini tidak menyediakan bid-ask spread, jadi spread sesungguhnya TIDAK diketahui. ' +
  'Yang dipakai adalah batas bawahnya yang bisa dibuktikan: harga hanya bergerak dalam ' +
  'kelipatan fraksi harga IDX, sehingga menyeberangi spread menelan minimal setengah tick ' +
  'per sisi. Lantai entry dihitung dari harga entry dan lantai exit dari harga exit; slippage ' +
  'yang dipakai = maksimum(asumsi konfigurasi, lantai setengah tick sisi tersebut). ' +
  'Angka ini tetap OPTIMISTIS - spread nyata bisa jauh lebih lebar, terutama saat pasar sepi.';

// ---------------------------------------------------------------------------
// Regime pasar - definisi DITETAPKAN DI SINI, sebelum melihat hasil intraday
// ---------------------------------------------------------------------------

export const REGIME_DEFINITION =
  'Regime ditentukan HANYA dari IHSG (^JKSE) harian, tidak pernah dari hasil sinyal: ' +
  'arah = tanda return IHSG hari itu (UP/DOWN); volatilitas = |return IHSG| hari itu ' +
  'dibandingkan MEDIAN |return IHSG| pada jendela yang sama (HIGHVOL/LOWVOL). ' +
  'Pembagian median dihitung atas seri IHSG saja, jadi tidak ada kebocoran dari outcome.';

async function classifyRegimes(tradingDates: string[]): Promise<Map<string, string> | null> {
  if (!tradingDates.length) return null;
  const history = await fetchYahooHistoryDirect('^JKSE', '6mo');
  if (!history?.history?.length) return null;

  const daily = history.history
    .map((row) => ({ date: row.Date.slice(0, 10), close: row.Close }))
    .filter((row) => Number.isFinite(row.close) && row.close > 0);

  const returns: Array<{ date: string; ret: number }> = [];
  for (let i = 1; i < daily.length; i++) {
    returns.push({ date: daily[i]!.date, ret: daily[i]!.close / daily[i - 1]!.close - 1 });
  }
  const wanted = new Set(tradingDates);
  const inWindow = returns.filter((r) => wanted.has(r.date));
  if (inWindow.length < 10) return null;

  const medianAbs = median(inWindow.map((r) => Math.abs(r.ret)))!;
  const map = new Map<string, string>();
  for (const row of inWindow) {
    const direction = row.ret > 0 ? 'UP' : 'DOWN';
    const vol = Math.abs(row.ret) > medianAbs ? 'HIGHVOL' : 'LOWVOL';
    map.set(row.date, `${direction}_${vol}`);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Kalibrasi
// ---------------------------------------------------------------------------

function buildCalibration(observations: IntradayObservation[]): CalibrationReport {
  const empty: CalibrationReport = {
    status: 'INSUFFICIENT_SAMPLE',
    samples: observations.length,
    bins: [],
    naive: null,
    isotonicOnTest: null,
    naiveOnTest: null,
    isotonicImprovesOutOfSample: false,
    splitDate: null,
    rejectedBins: 0,
    scoreReadableAsProbability: false,
    conclusion: 'Sampel belum cukup untuk menguji apakah skor bisa dibaca sebagai probabilitas.',
  };
  const effective = toEffectiveSample(observations);
  if (effective.effective < MIN_EFFECTIVE_SAMPLE_PER_CELL * 4) return empty;

  const pairs: CalibrationPair[] = observations.map((obs) => ({
    p: Math.min(1, Math.max(0, obs.score / 100)),
    y: obs.netReturn > 0 ? 1 : 0,
    score: obs.score,
    signalDate: obs.tradingDate,
  }));

  const bins = buildReliabilityBins(pairs);
  const naive = calibrationMetrics(pairs);

  const days = Array.from(new Set(pairs.map((p) => p.signalDate))).sort();
  const splitIndex = Math.floor(days.length * 0.7);
  const splitDate = days[splitIndex] ?? null;
  const trainPairs = splitDate ? pairs.filter((p) => p.signalDate < splitDate) : [];
  const testPairs = splitDate ? pairs.filter((p) => p.signalDate >= splitDate) : [];

  let isotonicOnTest = null;
  let naiveOnTest = null;
  if (trainPairs.length >= MIN_EFFECTIVE_SAMPLE_PER_CELL && testPairs.length >= MIN_EFFECTIVE_SAMPLE_PER_CELL) {
    const curve = fitIsotonic(trainPairs.map((p) => ({ x: p.score, y: p.y })));
    isotonicOnTest = calibrationMetrics(testPairs.map((p) => ({ ...p, p: applyIsotonic(curve, p.score) })));
    naiveOnTest = calibrationMetrics(testPairs);
  }

  const reliableBins = bins.filter((b) => b.reliable);
  const rejectedBins = reliableBins.filter((b) => !b.predictionWithinCi).length;
  const naiveRejected = reliableBins.length > 0 && rejectedBins > reliableBins.length / 2;
  const isotonicImproves =
    isotonicOnTest != null && naiveOnTest != null && isotonicOnTest.brier < naiveOnTest.brier;

  return {
    status: 'REPORTED',
    samples: pairs.length,
    bins,
    naive,
    isotonicOnTest,
    naiveOnTest,
    isotonicImprovesOutOfSample: isotonicImproves,
    splitDate,
    rejectedBins,
    scoreReadableAsProbability: !naiveRejected && (naive?.brierSkillScore ?? -1) > 0,
    conclusion: naiveRejected || (naive?.brierSkillScore ?? -1) <= 0
      ? 'Skor LensIntraday tidak boleh dibaca sebagai persentase peluang menang.'
      : 'Pemetaan naif skor->probabilitas belum tertolak oleh data pada jendela ini. Ini BUKAN klaim validasi; tetap perlu OOS.',
  };
}

// ---------------------------------------------------------------------------
// Laporan per horizon
// ---------------------------------------------------------------------------

function buildHorizonReport(horizon: IntradayHorizon, rows: ObservationRow[]): HorizonReport {
  const observations = toObservations(rows);
  const effective = toEffectiveSample(observations);
  const noFill = rows.filter((r) => r.fillStatus !== 'FILLED').length;
  const warnings: string[] = [];

  if (effective.effective < MIN_EFFECTIVE_SAMPLE_PER_CELL) {
    return {
      horizon,
      label: INTRADAY_HORIZON_LABEL[horizon],
      samplesRaw: rows.length,
      samplesMature: observations.length,
      samplesEffective: effective.effective,
      distinctTickers: effective.distinctTickers,
      distinctDays: effective.distinctDays,
      noFillPct: rows.length ? round(noFill / rows.length, 4) : null,
      stopLossPct: null,
      takeProfitPct: null,
      avgMfe: null,
      avgMae: null,
      performance: null,
      bootstrap: null,
      permutation: null,
      informationCoefficient: null,
      tradableShare: null,
      tradablePerformance: null,
      tradableBootstrap: null,
      status: 'INSUFFICIENT_SAMPLE',
      warnings: [`Sampel efektif ${effective.effective} di bawah minimum ${MIN_EFFECTIVE_SAMPLE_PER_CELL}.`],
    };
  }

  const performance = computePerformance(observations, effective);
  const bootstrap = tradingDayBlockBootstrapMean(observations);
  const permutation = tradingDayBlockSignFlipTest(observations);
  const ic = intradayInformationCoefficient(observations, (o) => o.tradingDate);

  if (performance.avgNetReturn != null && performance.medianNetReturn != null) {
    if (performance.avgNetReturn > 0 && performance.medianNetReturn < 0) {
      warnings.push('Rata-rata positif tetapi median negatif: keuntungan datang dari sedikit trade besar, bukan dari mayoritas trade.');
    }
  }
  if (performance.top5PctProfitShare != null && performance.top5PctProfitShare > 0.5) {
    warnings.push(`5% trade terbaik menyumbang ${(performance.top5PctProfitShare * 100).toFixed(1)}% seluruh profit kotor.`);
  }
  const avgGross = performance.avgGrossReturn;
  if (avgGross != null && performance.avgNetReturn != null && avgGross > 0 && performance.avgNetReturn <= 0) {
    warnings.push('Positif SEBELUM biaya, negatif SESUDAH biaya.');
  }
  if (bootstrap.ci95Low != null && bootstrap.ci95High != null && bootstrap.ci95Low <= 0 && bootstrap.ci95High >= 0) {
    warnings.push('Confidence interval 95% net expectancy masih melewati nol.');
  }

  const filled = rows.filter((r) => r.fillStatus === 'FILLED');
  const mfes = filled.map((r) => r.mfe).filter((v): v is number => v != null);
  const maes = filled.map((r) => r.mae).filter((v): v is number => v != null);

  // Irisan yang benar-benar bisa dieksekusi. `tradable === null` (baris lama, sebelum
  // kolomnya ada) TIDAK dianggap layak - "tidak tahu" bukan "ya".
  const tradableRows = rows.filter((r) => r.tradable === true);
  const tradableObs = toObservations(tradableRows);
  const tradableEffective = toEffectiveSample(tradableObs);
  const hasTradableSample = tradableEffective.effective >= MIN_EFFECTIVE_SAMPLE_PER_CELL;
  const tradablePerformance = hasTradableSample ? computePerformance(tradableObs, tradableEffective) : null;
  const tradableShare = observations.length ? round(tradableObs.length / observations.length, 4) : null;

  if (tradableShare != null && tradableShare < 0.5) {
    warnings.push(
      `Hanya ${(tradableShare * 100).toFixed(1)}% sinyal lolos gerbang kelayakan transaksi - sisanya terlalu murah atau terlalu sepi untuk dieksekusi.`
    );
  }
  if (
    tradablePerformance?.avgNetReturn != null &&
    performance.avgNetReturn != null &&
    performance.avgNetReturn > 0 &&
    tradablePerformance.avgNetReturn <= 0
  ) {
    warnings.push('Positif pada seluruh grid, tetapi TIDAK positif pada irisan yang benar-benar bisa dieksekusi.');
  }

  return {
    horizon,
    label: INTRADAY_HORIZON_LABEL[horizon],
    samplesRaw: rows.length,
    samplesMature: observations.length,
    samplesEffective: effective.effective,
    distinctTickers: effective.distinctTickers,
    distinctDays: effective.distinctDays,
    noFillPct: rows.length ? round(noFill / rows.length, 4) : null,
    stopLossPct: filled.length ? round(filled.filter((r) => r.exitReason === 'STOP_LOSS' || r.exitReason === 'TP_SL_SAME_BAR_CONSERVATIVE').length / filled.length, 4) : null,
    takeProfitPct: filled.length ? round(filled.filter((r) => r.exitReason === 'TAKE_PROFIT').length / filled.length, 4) : null,
    avgMfe: round(mean(mfes)),
    avgMae: round(mean(maes)),
    performance,
    bootstrap,
    permutation,
    informationCoefficient: ic,
    tradableShare,
    tradablePerformance,
    tradableBootstrap: hasTradableSample ? tradingDayBlockBootstrapMean(tradableObs, 800) : null,
    status: 'REPORTED',
    warnings,
  };
}

function buildBucketReports(rows: ObservationRow[]): BucketReport[] {
  const observations = toObservations(rows);
  const byBucket = groupBy(observations, (o) => intradayScoreBucket(o.score));
  // Bucket kosong TETAP muncul - menyembunyikannya membuat monotonicity terlihat
  // lebih rapi daripada kenyataannya.
  return INTRADAY_SCORE_BUCKETS.map((bucket) => {
    const rowsForBucket = byBucket.get(bucket.key) ?? [];
    const effective = toEffectiveSample(rowsForBucket);
    const perf = computePerformance(rowsForBucket, effective);
    const boot = rowsForBucket.length ? tradingDayBlockBootstrapMean(rowsForBucket, 800) : null;
    return {
      bucket: bucket.key,
      samplesRaw: rowsForBucket.length,
      samplesEffective: effective.effective,
      winRate: perf.winRate,
      avgNetReturn: perf.avgNetReturn,
      medianNetReturn: perf.medianNetReturn,
      profitFactor: perf.profitFactor,
      ci95Low: boot?.ci95Low ?? null,
      ci95High: boot?.ci95High ?? null,
      status: effective.effective < MIN_EFFECTIVE_SAMPLE_PER_CELL ? 'INSUFFICIENT_SAMPLE' : 'REPORTED',
    };
  });
}

const LIQUIDITY_BANDS = [
  { key: 'L1', label: '< Rp 1 miliar', max: 1e9 },
  { key: 'L2', label: 'Rp 1-5 miliar', max: 5e9 },
  { key: 'L3', label: 'Rp 5-25 miliar', max: 25e9 },
  { key: 'L4', label: '>= Rp 25 miliar', max: Number.POSITIVE_INFINITY },
] as const;

function liquidityBand(turnoverIdr: number): { key: string; label: string } {
  for (const band of LIQUIDITY_BANDS) {
    if (turnoverIdr < band.max) return { key: band.key, label: band.label };
  }
  return { key: 'L4', label: LIQUIDITY_BANDS[3].label };
}

// ---------------------------------------------------------------------------
// Eksekusi validasi
// ---------------------------------------------------------------------------

export interface RunValidationOptions {
  config?: IntradayRunConfig;
  triggeredBy: string;
  /** true = hanya sinyal setelah freeze protokol OOS aktif. */
  oosOnly?: boolean;
  fromDate?: string;
  toDate?: string;
}

export async function runIntradayValidation(options: RunValidationOptions): Promise<IntradayValidationResult> {
  const config = options.config ?? defaultIntradayRunConfig();
  const configHash = intradayConfigHash(config);
  const protocol = await getActiveOosProtocol();
  const oosOnly = Boolean(options.oosOnly && protocol);

  const runId = await startValidationRun({
    modelVersion: config.modelVersion,
    configHash,
    protocolVersion: protocol?.protocolVersion ?? null,
    triggeredBy: options.triggeredBy,
  });

  try {
    const result = await computeValidation(config, configHash, protocol, {
      oosOnly,
      fromDate: options.fromDate,
      toDate: options.toDate,
    });
    await finishValidationRun(runId, {
      status: result.status,
      datasetHash: result.datasetHash,
      sampleRaw: result.sample.raw,
      sampleEffective: result.sample.effective,
      result,
    });
    return result;
  } catch (err) {
    await finishValidationRun(runId, {
      status: 'VALIDATION_FAILED',
      datasetHash: null,
      sampleRaw: 0,
      sampleEffective: 0,
      result: null,
      // Pesan internal TIDAK diteruskan ke klien oleh route; ia hanya tercatat di sini
      // untuk penelusuran admin.
      errorMessage: err instanceof Error ? err.message : 'unknown',
    });
    throw err;
  }
}

async function computeValidation(
  config: IntradayRunConfig,
  configHash: string,
  protocol: OosProtocolRow | null,
  options: { oosOnly: boolean; fromDate?: string; toDate?: string }
): Promise<IntradayValidationResult> {
  const warnings: string[] = [];
  const criteria: AcceptanceCriteria =
    (protocol?.acceptanceCriteria as AcceptanceCriteria | undefined) ?? DEFAULT_ACCEPTANCE_CRITERIA;

  const quality = await getIntradayDataQualitySummary();
  const { rows, truncated } = await loadIntradayObservations({
    modelVersion: config.modelVersion,
    configHash,
    fromDate: options.fromDate,
    toDate: options.toDate,
    signalAfter: options.oosOnly ? protocol?.freezeTimestamp : undefined,
  });
  if (truncated) warnings.push('Dataset dipotong pada batas baris maksimum; persempit rentang tanggal untuk hasil penuh.');

  const allObservations = toObservations(rows);
  const effectiveAll = toEffectiveSample(allObservations);
  const dates = Array.from(new Set(rows.map((r) => r.tradingDate))).sort();

  const dataQualityGate = {
    passed: (quality.completenessPct ?? 0) >= criteria.minDataCompletenessPct,
    completenessPct: quality.completenessPct,
    minRequired: criteria.minDataCompletenessPct,
    reason:
      quality.completenessPct == null
        ? 'Belum ada catatan kualitas data - jalankan pengumpulan data terlebih dahulu.'
        : quality.completenessPct < criteria.minDataCompletenessPct
          ? `Kelengkapan bar ${quality.completenessPct}% di bawah batas ${criteria.minDataCompletenessPct}%.`
          : null,
  };

  const base: IntradayValidationResult = {
    generatedAt: new Date().toISOString(),
    modelName: LENS_INTRADAY_MODEL_NAME,
    modelKey: LENS_INTRADAY_MODEL_KEY,
    modelVersion: config.modelVersion,
    configHash,
    protocolVersion: protocol?.protocolVersion ?? null,
    datasetHash: allObservations.length ? computeDatasetHash(allObservations) : null,
    provider: config.provider,
    barInterval: config.interval,
    timezone: config.calendar.timezone,
    windowFrom: dates[0] ?? null,
    windowTo: dates[dates.length - 1] ?? null,
    oosMode: options.oosOnly,
    freezeTimestamp: protocol?.freezeTimestamp ?? null,
    sample: {
      raw: rows.length,
      mature: allObservations.length,
      effective: effectiveAll.effective,
      distinctTickers: effectiveAll.distinctTickers,
      distinctDays: effectiveAll.distinctDays,
      truncated,
    },
    dataQualityGate,
    horizons: [],
    buckets: {},
    monotonicity: {},
    timeOfDay: {},
    liquidity: {},
    concentration: { ticker: null, sector: null },
    regime: { definition: REGIME_DEFINITION, available: false, rows: [] },
    calibration: {
      status: 'INSUFFICIENT_SAMPLE',
      samples: 0,
      bins: [],
      naive: null,
      isotonicOnTest: null,
      naiveOnTest: null,
      isotonicImprovesOutOfSample: false,
      splitDate: null,
      rejectedBins: 0,
      scoreReadableAsProbability: false,
      conclusion: 'Belum diuji.',
    },
    componentDiagnostics: { rows: [], note: COMPONENT_DIAGNOSTIC_NOTE },
    spreadFloor: {
      bindingShare: null,
      entryBindingShare: null,
      exitBindingShare: null,
      medianAppliedSlippageBps: null,
      medianEntrySlippageBps: null,
      medianExitSlippageBps: null,
      maxAppliedSlippageBps: null,
      note: SPREAD_FLOOR_NOTE,
    },
    costSensitivity: [],
    walkForward: null,
    multipleTesting: [],
    acceptance: { criteria, items: [], passedAll: false, frozen: Boolean(protocol) },
    status: 'DATA_NOT_READY',
    warnings,
  };

  if (!rows.length) {
    base.status = quality.daysTracked > 0 ? 'COLLECTING_DATA' : 'DATA_NOT_READY';
    base.warnings.push(
      quality.daysTracked > 0
        ? 'Bar sudah terkumpul tetapi belum ada sinyal/outcome untuk konfigurasi ini.'
        : 'Belum ada data intraday sama sekali untuk konfigurasi ini.'
    );
    return base;
  }

  if (!dataQualityGate.passed) {
    base.status = 'DATA_NOT_READY';
    base.warnings.push(dataQualityGate.reason ?? 'Kualitas data belum memenuhi batas minimum.');
    return base;
  }

  // ---- per horizon ----
  const rowsByHorizon = groupBy(rows, (r) => r.horizon);
  for (const horizon of INTRADAY_HORIZONS) {
    const horizonRows = rowsByHorizon.get(horizon) ?? [];
    base.horizons.push(buildHorizonReport(horizon, horizonRows));

    const buckets = buildBucketReports(horizonRows);
    base.buckets[horizon] = buckets;
    base.monotonicity[horizon] = bucketMonotonicity(
      buckets.map((b) => ({ key: b.bucket, avgNetReturn: b.avgNetReturn }))
    );

    const horizonObs = toObservations(horizonRows);
    base.timeOfDay[horizon] = Array.from(groupBy(horizonObs, (o) => String(o.signalMinute)).entries())
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([minute, obs]) => sliceReport(minute, `${formatWibMinute(Number(minute))} WIB`, obs));

    base.liquidity[horizon] = Array.from(groupBy(horizonObs, (o) => liquidityBand(o.turnoverIdr).key).entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, obs]) => sliceReport(key, LIQUIDITY_BANDS.find((b) => b.key === key)?.label ?? key, obs));
  }

  // ---- horizon utama untuk analisis lintas-irisan ----
  const primaryRows = rowsByHorizon.get(PRIMARY_HORIZON) ?? [];
  const primaryObs = toObservations(primaryRows);

  base.concentration = {
    ticker: primaryObs.length ? concentrationBy(primaryObs, (o) => o.ticker) : null,
    sector: primaryObs.length ? concentrationBy(primaryObs, (o) => o.sector ?? 'UNCLASSIFIED') : null,
  };
  if (base.concentration.ticker?.concentrated) {
    warnings.push('Lebih dari separuh besaran P&L datang dari 5 emiten saja - hasil bergantung pada sedikit saham.');
  }
  if (base.concentration.sector?.concentrated) {
    warnings.push('P&L terkonsentrasi pada sedikit sektor.');
  }

  base.calibration = buildCalibration(primaryObs);
  base.componentDiagnostics = buildComponentDiagnostics(primaryRows);
  base.spreadFloor = buildSpreadFloorReport(primaryRows, config);
  base.costSensitivity = costSensitivity(primaryRows, config.priceFractions);

  const unhealthy = base.componentDiagnostics.rows.filter((row) => row.samples > 0 && !row.healthy);
  if (unhealthy.length) {
    warnings.push(
      `Komponen terlalu sering mentok di ujung skala (rentang pemetaan kemungkinan terlalu sempit): ${unhealthy
        .map((row) => `${row.component} ${((row.saturatedShare ?? 0) * 100).toFixed(1)}%`)
        .join(', ')}. Setel rentangnya terhadap SEBARAN KOMPONEN, bukan terhadap hasil.`
    );
  }
  if (base.spreadFloor.bindingShare != null && base.spreadFloor.bindingShare > 0.2) {
    warnings.push(
      `${(base.spreadFloor.bindingShare * 100).toFixed(1)}% trade memiliki minimal satu sisi slippage yang ditentukan lantai fraksi harga IDX, bukan asumsi konfigurasi - asumsi biaya datar terlalu optimistis untuk populasi ini.`
    );
  }
  if (base.costSensitivity.some((row) => !row.stillPositive)) {
    const failed = base.costSensitivity.filter((r) => !r.stillPositive).map((r) => r.scenario);
    warnings.push(`Ekspektasi net menjadi <= 0 pada skenario biaya: ${failed.join(', ')}.`);
  }

  base.walkForward = purgedWalkForward(primaryObs);

  const regimeMap = await classifyRegimes(dates).catch(() => null);
  if (regimeMap) {
    const withRegime = primaryObs.filter((o) => regimeMap.has(o.tradingDate));
    base.regime = {
      definition: REGIME_DEFINITION,
      available: withRegime.length > 0,
      rows: Array.from(groupBy(withRegime, (o) => regimeMap.get(o.tradingDate)!).entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, obs]) => sliceReport(key, key, obs)),
    };
  } else {
    warnings.push('Regime pasar tidak dapat ditentukan (data IHSG harian tidak tersedia untuk jendela ini).');
  }

  // ---- koreksi multiple testing ----
  base.multipleTesting = correctPValues(
    base.horizons.map((h) => ({ label: `${h.horizon}: net expectancy > 0`, pValue: h.permutation?.pValueOneTailed ?? null })),
    criteria.alpha
  );

  // ---- gerbang penerimaan ----
  const primary = base.horizons.find((h) => h.horizon === PRIMARY_HORIZON) ?? null;
  const primaryCorrected = base.multipleTesting.find((t) => t.label.startsWith(PRIMARY_HORIZON));
  const highSlippage = base.costSensitivity.find((c) => c.scenario === 'HIGH_SLIPPAGE');

  const items: AcceptanceGateItem[] = [
    gate('oos_days', 'Hari bursa OOS', `>= ${criteria.minOosTradingDays}`, String(base.sample.distinctDays), base.sample.distinctDays >= criteria.minOosTradingDays),
    gate('tickers', 'Jumlah emiten', `>= ${criteria.minDistinctTickers}`, String(base.sample.distinctTickers), base.sample.distinctTickers >= criteria.minDistinctTickers),
    gate('effective_total', 'Sampel efektif total', `>= ${criteria.minEffectiveSamplesTotal}`, String(base.sample.effective), base.sample.effective >= criteria.minEffectiveSamplesTotal),
    gate('effective_horizon', `Sampel efektif ${PRIMARY_HORIZON}`, `>= ${criteria.minEffectiveSamplesPerHorizon}`, String(primary?.samplesEffective ?? 0), (primary?.samplesEffective ?? 0) >= criteria.minEffectiveSamplesPerHorizon),
    gate('completeness', 'Kelengkapan data', `>= ${criteria.minDataCompletenessPct}%`, `${quality.completenessPct ?? 0}%`, dataQualityGate.passed),
    gate('expectancy', 'Net expectancy positif', '> 0', fmt(primary?.performance?.avgNetReturn), (primary?.performance?.avgNetReturn ?? 0) > 0),
    gate('ci_lower', 'Batas bawah CI 95%', '> 0', fmt(primary?.bootstrap?.ci95Low), (primary?.bootstrap?.ci95Low ?? -1) > 0),
    gate('profit_factor', 'Profit factor', '> 1', fmt(primary?.performance?.profitFactor, 3), (primary?.performance?.profitFactor ?? 0) > 1),
    gate('q_value', 'p-value terkoreksi (Holm)', `< ${criteria.alpha}`, fmt(primaryCorrected?.holm, 4), Boolean(primaryCorrected?.significantAfterCorrection)),
    gate('folds', 'Mayoritas fold positif', 'ya', base.walkForward ? `${base.walkForward.positiveFolds}/${base.walkForward.totalFolds}` : '-', Boolean(base.walkForward?.majorityPositive)),
    gate('concentration', 'Konsentrasi 5 emiten teratas', `<= ${criteria.maxTop5TickerAbsShare}`, fmt(base.concentration.ticker?.top5AbsShare, 3), (base.concentration.ticker?.top5AbsShare ?? 1) <= criteria.maxTop5TickerAbsShare),
    gate('slippage', 'Bertahan pada slippage tinggi', 'ya', highSlippage ? fmt(highSlippage.avgNetReturn) : '-', Boolean(highSlippage?.stillPositive)),
    // Grid riset boleh memuat sinyal yang tidak bisa dieksekusi; KANDIDAT PRODUKSI tidak.
    // Tanpa gerbang ini, model bisa lolos hanya karena saham gocap dan saham sepi.
    gate(
      'tradable',
      'Positif pada irisan yang bisa dieksekusi',
      '> 0',
      fmt(primary?.tradablePerformance?.avgNetReturn),
      (primary?.tradablePerformance?.avgNetReturn ?? 0) > 0
    ),
    gate('leakage', 'Tanpa look-ahead terdeteksi', 'ya', 'entry bar berikutnya, skor hanya dari bar selesai', true),
  ];
  const passedAll = items.every((i) => i.passed);
  base.acceptance = { criteria, items, passedAll, frozen: Boolean(protocol) };

  // ---- status akhir, fail-closed ----
  base.status = resolveStatus({
    hasProtocol: Boolean(protocol),
    oosMode: options.oosOnly,
    primary,
    passedAll,
    sampleEffective: base.sample.effective,
    criteria,
  });

  if (!protocol) {
    warnings.push('Belum ada protokol forward OOS yang dibekukan. Seluruh angka di sini bersifat in-sample/riset.');
  }
  base.warnings = warnings.concat(base.warnings.filter((w) => !warnings.includes(w)));
  return base;
}

function gate(key: string, label: string, required: string, observed: string, passed: boolean): AcceptanceGateItem {
  return { key, label, required, observed, passed };
}

function fmt(value: number | null | undefined, digits = 5): string {
  if (value == null || !Number.isFinite(value)) return 'n/a';
  return value.toFixed(digits);
}

function resolveStatus(input: {
  hasProtocol: boolean;
  oosMode: boolean;
  primary: HorizonReport | null;
  passedAll: boolean;
  sampleEffective: number;
  criteria: AcceptanceCriteria;
}): IntradayModelStatus {
  if (!input.primary || input.primary.status === 'INSUFFICIENT_SAMPLE') return 'INSUFFICIENT_SAMPLE';
  if (input.sampleEffective < input.criteria.minEffectiveSamplesTotal) return 'INSUFFICIENT_SAMPLE';

  const expectancy = input.primary.performance?.avgNetReturn ?? null;
  const ciLow = input.primary.bootstrap?.ci95Low ?? null;
  const ciHigh = input.primary.bootstrap?.ci95High ?? null;

  // Bukti NEGATIF adalah kesimpulan yang sah dan harus terlihat, bukan disamarkan
  // jadi "belum cukup data".
  if (ciHigh != null && ciHigh < 0) return 'VALIDATION_FAILED';
  if (expectancy != null && expectancy <= 0) return 'VALIDATION_FAILED';
  if (ciLow != null && ciHigh != null && ciLow <= 0 && ciHigh >= 0) return 'INCONCLUSIVE';

  // Lolos seluruh gerbang HANYA berarti kandidat, dan hanya kalau protokol OOS sudah
  // dibekukan dan run ini memang berjalan dalam mode OOS. Tanpa itu, apa pun angkanya,
  // ini tetap riset in-sample.
  if (input.passedAll && input.hasProtocol && input.oosMode) return 'CANDIDATE_VALIDATED';
  return 'RESEARCH_ONLY';
}

// ---------------------------------------------------------------------------
// Dashboard (murah)
// ---------------------------------------------------------------------------

export interface IntradayDashboard {
  modelName: string;
  modelKey: string;
  modelVersion: string;
  configHash: string;
  provider: string;
  barInterval: string;
  timezone: string;
  weights: typeof LENS_INTRADAY_WEIGHTS;
  coverage: Awaited<ReturnType<typeof getIntradayCoverage>>;
  dataQuality: Awaited<ReturnType<typeof getIntradayDataQualitySummary>>;
  latestRun: Awaited<ReturnType<typeof getLatestValidationRunResult>>;
  recentRuns: Awaited<ReturnType<typeof listValidationRuns>>;
  recentSamples: Awaited<ReturnType<typeof listRecentIntradaySamples>>;
  oosProtocol: OosProtocolRow | null;
  /**
   * Progres menuju OOS yang layak diuji. Horizon terpanjang LensIntraday adalah EOD hari
   * yang sama, jadi yang membatasi BUKAN pematangan label melainkan waktu kalender:
   * hari bursa hanya bisa dikumpulkan satu per satu ke depan.
   */
  oosProgress: {
    active: boolean;
    tradingDaysCollected: number;
    tradingDaysRequired: number;
    tickersCollected: number;
    tickersRequired: number;
    signalsCollected: number;
    /** Perkiraan hari bursa tersisa. null kalau belum ada protokol beku. */
    tradingDaysRemaining: number | null;
  };
  latestWeightProposal: unknown;
  latestThresholdProposal: unknown;
  status: IntradayModelStatus;
  disclaimer: string;
}

export async function getIntradayDashboard(config = defaultIntradayRunConfig()): Promise<IntradayDashboard> {
  const configHash = intradayConfigHash(config);
  const [coverage, dataQuality, latestRun, recentRuns, recentSamples, oosProtocol, weightProposal, thresholdProposal] =
    await Promise.all([
      getIntradayCoverage(config.modelVersion, configHash),
      getIntradayDataQualitySummary(),
      getLatestValidationRunResult(),
      listValidationRuns(10),
      listRecentIntradaySamples(config.modelVersion, configHash),
      getActiveOosProtocol(),
      getLatestWeightProposal(),
      getLatestThresholdProposal(),
    ]);

  // Coverage OOS dihitung terpisah supaya progres yang ditampilkan benar-benar sinyal
  // SETELAH freeze, bukan seluruh histori yang kebetulan sudah terkumpul.
  const oosCoverage = oosProtocol
    ? await getIntradayCoverage(config.modelVersion, configHash, oosProtocol.freezeTimestamp)
    : null;
  const criteria =
    (oosProtocol?.acceptanceCriteria as AcceptanceCriteria | undefined) ?? DEFAULT_ACCEPTANCE_CRITERIA;
  const oosProgress = {
    active: Boolean(oosProtocol),
    tradingDaysCollected: oosCoverage?.distinctTradingDays ?? 0,
    tradingDaysRequired: criteria.minOosTradingDays,
    tickersCollected: oosCoverage?.distinctTickers ?? 0,
    tickersRequired: criteria.minDistinctTickers,
    signalsCollected: oosCoverage?.totalSignals ?? 0,
    tradingDaysRemaining: oosCoverage
      ? Math.max(0, criteria.minOosTradingDays - oosCoverage.distinctTradingDays)
      : null,
  };

  // Status di kartu ringkasan diambil dari run terakhir kalau ada. Kalau belum pernah
  // ada run, ia TIDAK menebak - ia melaporkan keadaan pengumpulan data apa adanya.
  const runStatus = (latestRun?.result as IntradayValidationResult | undefined)?.status;
  const status: IntradayModelStatus =
    runStatus ??
    (coverage.totalSignals === 0
      ? dataQuality.daysTracked > 0
        ? 'COLLECTING_DATA'
        : 'DATA_NOT_READY'
      : 'WAITING_FOR_MATURITY');

  return {
    modelName: LENS_INTRADAY_MODEL_NAME,
    modelKey: LENS_INTRADAY_MODEL_KEY,
    modelVersion: config.modelVersion,
    configHash,
    provider: config.provider,
    barInterval: config.interval,
    timezone: config.calendar.timezone,
    weights: config.weights,
    coverage,
    dataQuality,
    latestRun,
    recentRuns,
    recentSamples,
    oosProtocol,
    oosProgress,
    latestWeightProposal: weightProposal,
    latestThresholdProposal: thresholdProposal,
    status,
    disclaimer:
      'LensIntraday adalah model riset terpisah. Angka di halaman ini TIDAK berlaku untuk LensScore T+20, ' +
      'dan tidak boleh dibaca sebagai rekomendasi beli/jual.',
  };
}
