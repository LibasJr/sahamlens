// Alat riset admin LensIntraday: simulator ambang, optimizer bobot, dan pembekuan
// protokol forward out-of-sample.
//
// ATURAN KERAS yang dikodekan di sini, bukan sekadar ditulis di UI:
//   - Simulator ambang TIDAK PERNAH menulis ke konfigurasi produksi mana pun. Ia
//     hanya menghasilkan baris proposal berstatus FROZEN_PENDING_OOS.
//   - Optimizer bobot memisahkan TRAIN / VALIDATION / TEST secara berurutan waktu,
//     dengan embargo hari bursa di tiap batas, dan hanya melaporkan.
//   - Protokol OOS di-INSERT, tidak pernah di-UPDATE. Formula berubah = protokol baru.

import {
  INTRADAY_COMPONENT_KEYS,
  INTRADAY_WEIGHT_BOUNDS,
  LENS_INTRADAY_WEIGHTS,
  MIN_EFFECTIVE_SAMPLE_PER_CELL,
  defaultIntradayRunConfig,
  intradayConfigHash,
  type IntradayHorizon,
  type IntradayRunConfig,
  type IntradayWeights,
} from '../constants/intraday-model';
import {
  computePerformance,
  concentrationBy,
  correctPValues,
  mean,
  round,
  spearman,
  toEffectiveSample,
  tradingDayBlockSignFlipTest,
  type IntradayObservation,
} from './intraday-stats';
import {
  getActiveOosProtocol,
  insertOosProtocol,
  insertThresholdProposal,
  insertWeightProposal,
  loadIntradayObservations,
  type ObservationRow,
} from '../repository/intraday.repository';
import {
  DEFAULT_ACCEPTANCE_CRITERIA,
  PRIMARY_HORIZON,
  type AcceptanceCriteria,
} from './intraday-validation.service';

// ---------------------------------------------------------------------------
// Simulator ambang
// ---------------------------------------------------------------------------

export interface ThresholdSimulationRow {
  threshold: number;
  signals: number;
  samplesEffective: number;
  winRate: number | null;
  avgNetReturn: number | null;
  medianNetReturn: number | null;
  profitFactor: number | null;
  maxDrawdown: number | null;
  top5TickerAbsShare: number | null;
  pValue: number | null;
  correctedPValue: number | null;
  significantAfterCorrection: boolean;
  status: 'INSUFFICIENT_SAMPLE' | 'REPORTED';
}

export interface ThresholdSimulationResult {
  horizon: IntradayHorizon;
  modelVersion: string;
  configHash: string;
  rows: ThresholdSimulationRow[];
  multipleTestingNote: string;
  productionImpact: 'NONE';
  note: string;
}

export const THRESHOLD_MULTIPLE_TESTING_NOTE =
  'Setiap baris di tabel ini adalah satu uji hipotesis. Menguji belasan ambang lalu ' +
  'mengambil yang p-value-nya terkecil adalah cara paling umum menemukan pola yang ' +
  'tidak ada. Kolom p-value terkoreksi (Holm) sudah memperhitungkan jumlah ambang ' +
  'yang diuji di tabel yang sama.';

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

export async function simulateIntradayThresholds(input: {
  config?: IntradayRunConfig;
  horizon?: IntradayHorizon;
  thresholds?: number[];
}): Promise<ThresholdSimulationResult> {
  const config = input.config ?? defaultIntradayRunConfig();
  const configHash = intradayConfigHash(config);
  const horizon = input.horizon ?? PRIMARY_HORIZON;
  const thresholds = (input.thresholds?.length ? input.thresholds : [0, 40, 45, 50, 55, 60, 65, 70, 75, 80])
    .map((t) => Math.round(t))
    .filter((t) => t >= 0 && t <= 100)
    .sort((a, b) => a - b);

  const { rows } = await loadIntradayObservations({ modelVersion: config.modelVersion, configHash, horizon });
  const observations = toObservations(rows);

  const raw = thresholds.map((threshold) => {
    const subset = observations.filter((o) => o.score >= threshold);
    const effective = toEffectiveSample(subset);
    if (effective.effective < MIN_EFFECTIVE_SAMPLE_PER_CELL) {
      return {
        threshold,
        signals: subset.length,
        samplesEffective: effective.effective,
        winRate: null,
        avgNetReturn: null,
        medianNetReturn: null,
        profitFactor: null,
        maxDrawdown: null,
        top5TickerAbsShare: null,
        pValue: null,
        status: 'INSUFFICIENT_SAMPLE' as const,
      };
    }
    const perf = computePerformance(subset, effective);
    const permutation = tradingDayBlockSignFlipTest(subset, 1000);
    const concentration = concentrationBy(subset, (o) => o.ticker);
    return {
      threshold,
      signals: subset.length,
      samplesEffective: effective.effective,
      winRate: perf.winRate,
      avgNetReturn: perf.avgNetReturn,
      medianNetReturn: perf.medianNetReturn,
      profitFactor: perf.profitFactor,
      maxDrawdown: perf.maxDrawdown,
      top5TickerAbsShare: concentration.top5AbsShare,
      pValue: permutation.pValueOneTailed,
      status: 'REPORTED' as const,
    };
  });

  const corrected = correctPValues(raw.map((r) => ({ label: `t${r.threshold}`, pValue: r.pValue })));
  const byLabel = new Map(corrected.map((c) => [c.label, c]));

  return {
    horizon,
    modelVersion: config.modelVersion,
    configHash,
    rows: raw.map((r) => {
      const c = byLabel.get(`t${r.threshold}`);
      return {
        ...r,
        correctedPValue: c?.holm ?? null,
        significantAfterCorrection: Boolean(c?.significantAfterCorrection),
      };
    }),
    multipleTestingNote: THRESHOLD_MULTIPLE_TESTING_NOTE,
    productionImpact: 'NONE',
    note: 'Slider ini tidak mengubah ambang produksi apa pun. Ambang LensScore T+20 dan rekomendasi aplikasi tidak tersentuh.',
  };
}

export async function proposeIntradayThreshold(input: {
  threshold: number;
  config?: IntradayRunConfig;
  horizon?: IntradayHorizon;
  proposedBy: string;
}): Promise<{ proposalId: number; status: string; reason: string }> {
  const config = input.config ?? defaultIntradayRunConfig();
  const configHash = intradayConfigHash(config);
  const simulation = await simulateIntradayThresholds({
    config,
    horizon: input.horizon,
    thresholds: [input.threshold],
  });
  const protocol = await getActiveOosProtocol();

  // Proposal SELALU dibekukan sampai OOS asli memenuhi syarat. Tidak ada jalur kode
  // apa pun di modul ini yang mengubahnya menjadi ambang aktif.
  const reason = protocol
    ? `Protokol OOS ${protocol.protocolVersion} aktif sejak ${protocol.freezeTimestamp}. Proposal tetap dibekukan sampai gerbang penerimaan terpenuhi pada sinyal SETELAH freeze.`
    : 'Belum ada protokol forward OOS yang dibekukan; ambang yang dipilih dari data yang sama tidak boleh dipakai untuk menguji dirinya sendiri.';

  const proposalId = await insertThresholdProposal({
    modelVersion: config.modelVersion,
    configHash,
    proposedThreshold: input.threshold,
    selectionResult: { simulation, proposedBy: input.proposedBy, multipleTestingNote: THRESHOLD_MULTIPLE_TESTING_NOTE },
    status: 'FROZEN_PENDING_OOS',
    reason,
  });

  return { proposalId, status: 'FROZEN_PENDING_OOS', reason };
}

// ---------------------------------------------------------------------------
// Optimizer bobot
// ---------------------------------------------------------------------------

export const INSUFFICIENT_COMPONENT_HISTORY_MESSAGE =
  'Histori komponen LensIntraday belum cukup untuk simulasi bobot.';

export interface WeightSplitReport {
  label: 'TRAIN' | 'VALIDATION' | 'TEST';
  fromDate: string | null;
  toDate: string | null;
  samplesRaw: number;
  samplesEffective: number;
  informationCoefficient: number | null;
  avgNetReturnTopQuintile: number | null;
  avgNetReturnBottomQuintile: number | null;
  spread: number | null;
  pValue: number | null;
}

export interface WeightProposalResult {
  status: 'INSUFFICIENT_DATA' | 'NO_IMPROVEMENT' | 'PROPOSED';
  proposalId: number | null;
  currentWeights: IntradayWeights;
  proposedWeights: IntradayWeights | null;
  train: WeightSplitReport | null;
  validation: WeightSplitReport | null;
  test: WeightSplitReport | null;
  candidatesEvaluated: number;
  regularizationLambda: number;
  embargoDays: number;
  multipleTesting: ReturnType<typeof correctPValues>;
  reason: string;
  productionImpact: 'NONE';
}

interface ComponentObservation extends IntradayObservation {
  componentScores: Record<string, number>;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scoreWith(weights: IntradayWeights, components: Record<string, number>): number {
  let total = 0;
  let weighted = 0;
  for (const key of INTRADAY_COMPONENT_KEYS) {
    total += weights[key];
    weighted += weights[key] * (components[key] ?? 50);
  }
  return total > 0 ? weighted / total : 50;
}

/** Kandidat bobot acak di dalam batas, dinormalisasi ke jumlah 100. */
function randomWeights(rng: () => number): IntradayWeights {
  const { min, max } = INTRADAY_WEIGHT_BOUNDS;
  const draw = INTRADAY_COMPONENT_KEYS.map(() => min + rng() * (max - min));
  const sum = draw.reduce((a, b) => a + b, 0);
  const scaled = draw.map((v) => (v / sum) * 100);
  const out = {} as IntradayWeights;
  INTRADAY_COMPONENT_KEYS.forEach((key, i) => {
    out[key] = round(Math.min(max, Math.max(min, scaled[i]!)), 2)!;
  });
  return out;
}

function l1Distance(a: IntradayWeights, b: IntradayWeights): number {
  return INTRADAY_COMPONENT_KEYS.reduce((sum, key) => sum + Math.abs(a[key] - b[key]), 0);
}

function quintileSpread(rows: Array<{ score: number; netReturn: number }>): {
  top: number | null;
  bottom: number | null;
  spread: number | null;
} {
  if (rows.length < 10) return { top: null, bottom: null, spread: null };
  const sorted = [...rows].sort((a, b) => a.score - b.score);
  const size = Math.max(1, Math.floor(sorted.length / 5));
  const bottom = mean(sorted.slice(0, size).map((r) => r.netReturn));
  const top = mean(sorted.slice(-size).map((r) => r.netReturn));
  return {
    top: round(top),
    bottom: round(bottom),
    spread: top != null && bottom != null ? round(top - bottom) : null,
  };
}

function splitReport(
  label: WeightSplitReport['label'],
  weights: IntradayWeights,
  rows: ComponentObservation[]
): WeightSplitReport {
  const rescored = rows.map((r) => ({ ...r, score: scoreWith(weights, r.componentScores) }));
  const effective = toEffectiveSample(rescored);
  const dates = Array.from(new Set(rows.map((r) => r.tradingDate))).sort();
  const q = quintileSpread(rescored);
  const topSubset = rescored.filter((r) => r.score >= 60);
  return {
    label,
    fromDate: dates[0] ?? null,
    toDate: dates[dates.length - 1] ?? null,
    samplesRaw: rows.length,
    samplesEffective: effective.effective,
    informationCoefficient: round(spearman(rescored.map((r) => r.score), rescored.map((r) => r.netReturn)), 4),
    avgNetReturnTopQuintile: q.top,
    avgNetReturnBottomQuintile: q.bottom,
    spread: q.spread,
    pValue: topSubset.length >= MIN_EFFECTIVE_SAMPLE_PER_CELL
      ? tradingDayBlockSignFlipTest(topSubset, 1000).pValueOneTailed
      : null,
  };
}

/** Bobot hanya boleh berubah sedikit dari bobot berjalan - lambda mengendalikan itu. */
export const WEIGHT_REGULARIZATION_LAMBDA = 0.0004;
const WEIGHT_CANDIDATES = 400;
const WEIGHT_EMBARGO_DAYS = 1;

export async function proposeIntradayWeights(input: {
  config?: IntradayRunConfig;
  horizon?: IntradayHorizon;
  proposedBy: string;
}): Promise<WeightProposalResult> {
  const config = input.config ?? defaultIntradayRunConfig();
  const configHash = intradayConfigHash(config);
  const horizon = input.horizon ?? PRIMARY_HORIZON;

  const { rows } = await loadIntradayObservations({ modelVersion: config.modelVersion, configHash, horizon });
  const withComponents: ComponentObservation[] = rows
    .filter((r) => r.fillStatus === 'FILLED' && r.netReturn != null && r.grossReturn != null && r.componentScores != null)
    .map((r) => ({
      ticker: r.ticker,
      tradingDate: r.tradingDate,
      signalMinute: r.signalMinute,
      score: r.score,
      netReturn: r.netReturn as number,
      grossReturn: r.grossReturn as number,
      sector: r.sector,
      turnoverIdr: r.turnoverIdr,
      componentScores: r.componentScores as Record<string, number>,
    }));

  const empty: WeightProposalResult = {
    status: 'INSUFFICIENT_DATA',
    proposalId: null,
    currentWeights: config.weights,
    proposedWeights: null,
    train: null,
    validation: null,
    test: null,
    candidatesEvaluated: 0,
    regularizationLambda: WEIGHT_REGULARIZATION_LAMBDA,
    embargoDays: WEIGHT_EMBARGO_DAYS,
    multipleTesting: [],
    reason: INSUFFICIENT_COMPONENT_HISTORY_MESSAGE,
    productionImpact: 'NONE',
  };

  const days = Array.from(new Set(withComponents.map((r) => r.tradingDate))).sort();
  // Butuh tiga blok waktu plus dua embargo. Di bawah ini pemisahan train/val/test
  // hanya akan menjadi tiga potong data yang sama.
  if (withComponents.length < MIN_EFFECTIVE_SAMPLE_PER_CELL * 6 || days.length < 15) return empty;

  const trainEnd = Math.floor(days.length * 0.5);
  const validationStart = trainEnd + WEIGHT_EMBARGO_DAYS;
  const validationEnd = validationStart + Math.floor(days.length * 0.25);
  const testStart = validationEnd + WEIGHT_EMBARGO_DAYS;
  if (testStart >= days.length) return empty;

  const trainDays = new Set(days.slice(0, trainEnd));
  const validationDays = new Set(days.slice(validationStart, validationEnd));
  const testDays = new Set(days.slice(testStart));

  const trainRows = withComponents.filter((r) => trainDays.has(r.tradingDate));
  const validationRows = withComponents.filter((r) => validationDays.has(r.tradingDate));
  const testRows = withComponents.filter((r) => testDays.has(r.tradingDate));
  if (!trainRows.length || !validationRows.length || !testRows.length) return empty;

  // Objektif TRAIN: Spearman IC dikurangi penalti L1 terhadap bobot berjalan.
  // IC dipilih (bukan rata-rata return) karena berbasis ranking, jadi satu trade
  // ekstrem tidak bisa menentukan bobot sendirian.
  const rng = mulberry32(0x1e45c0de ^ trainRows.length);
  const candidates: IntradayWeights[] = [config.weights, LENS_INTRADAY_WEIGHTS];
  for (let i = 0; i < WEIGHT_CANDIDATES; i++) candidates.push(randomWeights(rng));

  const objective = (weights: IntradayWeights, rowsFor: ComponentObservation[]): number => {
    const scores = rowsFor.map((r) => scoreWith(weights, r.componentScores));
    const ic = spearman(scores, rowsFor.map((r) => r.netReturn)) ?? 0;
    return ic - WEIGHT_REGULARIZATION_LAMBDA * l1Distance(weights, config.weights);
  };

  let bestTrain = candidates[0]!;
  let bestTrainScore = objective(bestTrain, trainRows);
  for (const candidate of candidates) {
    const value = objective(candidate, trainRows);
    if (value > bestTrainScore) {
      bestTrainScore = value;
      bestTrain = candidate;
    }
  }

  // VALIDATION memilih antara bobot berjalan dan kandidat terbaik dari TRAIN.
  // Ini yang mencegah bobot yang cuma cocok di TRAIN lolos ke laporan TEST.
  const baselineValidation = objective(config.weights, validationRows);
  const candidateValidation = objective(bestTrain, validationRows);
  const improves = candidateValidation > baselineValidation;

  const train = splitReport('TRAIN', improves ? bestTrain : config.weights, trainRows);
  const validation = splitReport('VALIDATION', improves ? bestTrain : config.weights, validationRows);
  const test = splitReport('TEST', improves ? bestTrain : config.weights, testRows);

  const multipleTesting = correctPValues([
    { label: 'TRAIN', pValue: train.pValue },
    { label: 'VALIDATION', pValue: validation.pValue },
    { label: 'TEST', pValue: test.pValue },
  ]);

  const status = improves ? 'PROPOSED' : 'NO_IMPROVEMENT';
  const reason = improves
    ? `Kandidat mengungguli bobot berjalan di VALIDATION (objektif ${round(candidateValidation, 4)} vs ${round(baselineValidation, 4)}). ` +
      'Hasil TEST dilaporkan apa adanya dan TIDAK dipakai memilih bobot. Proposal ini hanya untuk ditinjau admin.'
    : `Tidak ada kandidat yang mengungguli bobot berjalan di VALIDATION (objektif ${round(candidateValidation, 4)} vs ${round(baselineValidation, 4)}). Bobot dipertahankan.`;

  const proposalId = await insertWeightProposal({
    modelVersion: config.modelVersion,
    configHash,
    currentWeights: config.weights,
    proposedWeights: improves ? bestTrain : null,
    trainResult: train,
    validationResult: validation,
    testResult: test,
    status: improves ? 'PROPOSED_PENDING_REVIEW' : 'NO_IMPROVEMENT',
    reason: `${reason} Diajukan oleh ${input.proposedBy}.`,
  });

  return {
    status,
    proposalId,
    currentWeights: config.weights,
    proposedWeights: improves ? bestTrain : null,
    train,
    validation,
    test,
    candidatesEvaluated: candidates.length,
    regularizationLambda: WEIGHT_REGULARIZATION_LAMBDA,
    embargoDays: WEIGHT_EMBARGO_DAYS,
    multipleTesting,
    reason,
    productionImpact: 'NONE',
  };
}

// ---------------------------------------------------------------------------
// Pembekuan protokol OOS
// ---------------------------------------------------------------------------

export interface FreezeOosInput {
  config?: IntradayRunConfig;
  acceptanceCriteria?: AcceptanceCriteria;
  frozenBy: string;
}

export interface FreezeOosResult {
  created: boolean;
  protocolVersion: string;
  freezeTimestamp: string;
  configHash: string;
  reason: string;
}

/**
 * Membekukan konfigurasi LensIntraday saat ini sebagai protokol OOS baru.
 *
 * protocol_version diturunkan dari model_version + config_hash, jadi dua pembekuan
 * atas konfigurasi yang SAMA menghasilkan versi yang sama dan yang kedua ditolak
 * (created=false) alih-alih diam-diam memundurkan freeze_timestamp. Mengubah satu
 * bobot/biaya/aturan entry akan menghasilkan config_hash berbeda, jadi protokol baru -
 * itulah yang membuat "diedit diam-diam setelah freeze" tidak mungkin lolos.
 */
export async function freezeIntradayOosProtocol(input: FreezeOosInput): Promise<FreezeOosResult> {
  const config = input.config ?? defaultIntradayRunConfig();
  const configHash = intradayConfigHash(config);
  const protocolVersion = `oos-${config.modelVersion}-${configHash}`;
  const freezeTimestamp = new Date().toISOString();

  const { inserted } = await insertOosProtocol({
    protocolVersion,
    freezeTimestamp,
    modelVersion: config.modelVersion,
    configHash,
    scoreFormula: {
      description:
        'score = sum(bobot_i * komponen_i) / sum(bobot); komponen dihitung HANYA dari bar intraday yang sudah selesai pada signal_timestamp.',
      components: INTRADAY_COMPONENT_KEYS,
      // Rentang pemetaan ikut dibekukan sebagai ANGKA, bukan kalimat. Kalau ia hanya
      // dideskripsikan, mengubahnya tidak akan pernah ketahuan dari baris protokol ini.
      componentMapping: config.componentMapping,
      mapping: {
        momentum: `return 30 menit dipetakan linear dari [-${config.componentMapping.momentumAbs}, +${config.componentMapping.momentumAbs}] ke [0,100]`,
        vwapDeviation: `deviasi terhadap VWAP sesi dipetakan linear dari [-${config.componentMapping.vwapDeviationAbs}, +${config.componentMapping.vwapDeviationAbs}] ke [0,100]`,
        volumeSurge: `volume 3 bar terakhir / rata-rata sesi, skala log dengan span ${config.componentMapping.volumeSurgeSpan}x ke [0,100]`,
        rangePosition: 'posisi close dalam rentang high-low sesi, 0-1 dikali 100',
        trendPersistence: 'porsi bar naik dalam 12 bar terakhir (bar datar dihitung 0,5), 0-1 dikali 100',
      },
    },
    weights: config.weights,
    thresholds: { scoreThreshold: config.scoreThreshold, takeProfitPct: config.takeProfitPct, stopLossPct: config.stopLossPct },
    entryExitRules: {
      entry: `bar ke-${config.entryLagBars} setelah signal_timestamp, harga OPEN bar tersebut`,
      exitHorizon: 'bar pertama yang selesai pada atau setelah entry + horizon; jeda sesi menggeser exit ke bar pertama setelah jeda',
      exitEod: `close bar valid terakhir yang SELESAI pada atau sebelum menit ${config.calendar.eodExitCutoffMinute} WIB`,
      tpSlSameBar: 'diasumsikan stop-loss lebih dulu (konservatif)',
      calendar: config.calendar,
      interval: config.interval,
      provider: config.provider,
      tradability: config.tradability,
    },
    costConfig: {
      ...config.cost,
      // Lantai spread mengubah net return, jadi ia bagian dari model biaya - bukan
      // detail implementasi yang boleh berubah setelah freeze.
      priceFractions: config.priceFractions,
      slippageRule: 'slippage per sisi = maksimum(asumsi konfigurasi, setengah fraksi harga IDX / harga entry)',
    },
    acceptanceCriteria: input.acceptanceCriteria ?? DEFAULT_ACCEPTANCE_CRITERIA,
    frozenBy: input.frozenBy,
  });

  return {
    created: inserted,
    protocolVersion,
    freezeTimestamp,
    configHash,
    reason: inserted
      ? 'Protokol dibekukan. Mulai sekarang hanya sinyal dengan signal_timestamp SETELAH freeze yang boleh disebut genuine OOS.'
      : 'Protokol dengan konfigurasi identik sudah ada. Freeze lama dipertahankan - histori OOS tidak boleh dimundurkan.',
  };
}
