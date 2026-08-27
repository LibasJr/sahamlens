// Tipe payload dashboard Intraday Validation Lab. Dipisah dari komponen supaya
// section-section presentasi bisa mengimpornya tanpa ikut menyeret logic React.
// Sumber kebenaran tetap bentuk yang dikirim server; halaman ini hanya menampilkan.

export type Nullable<T> = T | null | undefined;

export interface RunRow {
  runId: number;
  status: string;
  startedAt: string;
  completedAt: Nullable<string>;
  sampleRaw: number;
  sampleEffective: number;
  datasetHash: Nullable<string>;
  protocolVersion: Nullable<string>;
  errorMessage: Nullable<string>;
  triggeredBy: Nullable<string>;
}

export type JsonRecord = Record<string, unknown>;

export interface SliceRow {
  key: string;
  label: string;
  status?: string;
  samplesRaw?: Nullable<number>;
  samplesEffective?: Nullable<number>;
  winRate?: Nullable<number>;
  avgNetReturn?: Nullable<number>;
  medianNetReturn?: Nullable<number>;
  profitFactor?: Nullable<number>;
}

export interface ConcentrationEntry {
  key: string;
  samples?: Nullable<number>;
  totalNetReturn?: Nullable<number>;
  shareOfGrossProfit?: Nullable<number>;
  shareOfGrossLoss?: Nullable<number>;
}

export interface ConcentrationSummary {
  top5AbsShare?: Nullable<number>;
  concentrated?: boolean;
  topWinners?: ConcentrationEntry[];
  topLosers?: ConcentrationEntry[];
}

export interface HorizonResult {
  horizon: string;
  label: string;
  status?: string;
  samplesRaw?: Nullable<number>;
  samplesEffective?: Nullable<number>;
  performance?: JsonRecord;
  tradablePerformance?: JsonRecord;
  bootstrap?: JsonRecord;
  permutation?: JsonRecord;
  tradableBootstrap?: JsonRecord;
  warnings?: string[];
  avgMfe?: Nullable<number>;
  avgMae?: Nullable<number>;
  noFillPct?: Nullable<number>;
  stopLossPct?: Nullable<number>;
  takeProfitPct?: Nullable<number>;
  tradableShare?: Nullable<number>;
}

export interface BucketResult extends SliceRow {
  bucket: string;
  ci95Low?: Nullable<number>;
  ci95High?: Nullable<number>;
}


export interface CalibrationBinResult {
  binLow: number;
  binHigh: number;
  samples?: Nullable<number>;
  predicted?: Nullable<number>;
  observed?: Nullable<number>;
  wilsonLow?: Nullable<number>;
  wilsonHigh?: Nullable<number>;
  reliable?: boolean;
  predictionWithinCi?: boolean;
}

export interface CalibrationResult {
  samples?: Nullable<number>;
  naive?: {
    baseRate?: Nullable<number>;
    ece?: Nullable<number>;
    brier?: Nullable<number>;
    brierBaseRate?: Nullable<number>;
    brierSkillScore?: Nullable<number>;
  };
  splitDate?: Nullable<string>;
  isotonicOnTest?: boolean;
  isotonicImprovesOutOfSample?: boolean;
  bins?: CalibrationBinResult[];
  scoreReadableAsProbability?: boolean;
  conclusion?: string;
  [key: string]: unknown;
}

export interface WalkForwardFold {
  fold: string | number;
  trainStart?: Nullable<string>;
  trainEnd?: Nullable<string>;
  testStart?: Nullable<string>;
  testEnd?: Nullable<string>;
  trainSamples?: Nullable<number>;
  testSamples?: Nullable<number>;
  testAvgNetReturn?: Nullable<number>;
  testWinRate?: Nullable<number>;
  purgedDays?: Nullable<number>;
}

export interface WalkForwardResult {
  note?: string;
  folds?: WalkForwardFold[];
  positiveFolds?: Nullable<number>;
  totalFolds?: Nullable<number>;
  [key: string]: unknown;
}

export interface MultipleTestingResult {
  label?: string;
  holm?: Nullable<number>;
  significantAfterCorrection?: boolean;
}

export interface ThresholdSimulationResult {
  rows?: Array<{ threshold: number; [key: string]: unknown }>;
  [key: string]: unknown;
}

export interface WeightProposalResult {
  [key: string]: unknown;
}

export type ActionResult = ThresholdSimulationResult | WeightProposalResult | JsonRecord;

export interface ValidationResult {
  generatedAt: string;
  status: string;
  datasetHash: Nullable<string>;
  windowFrom: Nullable<string>;
  windowTo: Nullable<string>;
  oosMode: boolean;
  freezeTimestamp: Nullable<string>;
  sample: { raw: number; mature: number; effective: number; distinctTickers: number; distinctDays: number; truncated: boolean };
  dataQualityGate: { passed: boolean; completenessPct: Nullable<number>; minRequired: number; reason: Nullable<string> };
  horizons: HorizonResult[];
  buckets: Record<string, BucketResult[]>;
  monotonicity: Record<string, { rho?: Nullable<number>; monotonic?: boolean; bucketsCompared?: Nullable<number> }>;
  timeOfDay: Record<string, SliceRow[]>;
  liquidity: Record<string, SliceRow[]>;
  concentration: { ticker: ConcentrationSummary | null; sector: ConcentrationSummary | null };
  regime: { definition: string; available: boolean; rows: SliceRow[] };
  calibration: CalibrationResult;
  componentDiagnostics: { rows: JsonRecord[]; note: string };
  spreadFloor: {
    bindingShare: Nullable<number>;
    entryBindingShare: Nullable<number>;
    exitBindingShare: Nullable<number>;
    medianAppliedSlippageBps: Nullable<number>;
    medianEntrySlippageBps: Nullable<number>;
    medianExitSlippageBps: Nullable<number>;
    maxAppliedSlippageBps: Nullable<number>;
    note: string;
  };
  costSensitivity: JsonRecord[];
  walkForward: WalkForwardResult;
  multipleTesting: MultipleTestingResult[];
  acceptance: { criteria: JsonRecord; items: JsonRecord[]; passedAll: boolean; frozen: boolean };
  warnings: string[];
}

export interface Dashboard {
  modelName: string;
  modelKey: string;
  modelVersion: string;
  configHash: string;
  provider: string;
  barInterval: string;
  timezone: string;
  weights: Record<string, number>;
  coverage: {
    totalSignals: number;
    totalOutcomes: number;
    filledOutcomes: number;
    distinctTickers: number;
    distinctTradingDays: number;
    firstTradingDate: Nullable<string>;
    lastTradingDate: Nullable<string>;
    lastSignalTimestamp: Nullable<string>;
  };
  dataQuality: {
    tickersTracked: number;
    daysTracked: number;
    totalExpectedBars: number;
    totalValidBars: number;
    totalMissingBars: number;
    totalDuplicateBars: number;
    totalInvalidOhlcBars: number;
    missingDayRows: number;
    completenessPct: Nullable<number>;
    problemTickers: Array<{ ticker: string; badDays: number; worstStatus: string }>;
    problemDates: Array<{ tradingDate: string; badTickers: number }>;
    lastRetrievedAt: Nullable<string>;
    lastFetchError: Nullable<{ ticker: string; error: string; at: string }>;
  };
  latestRun: Nullable<{ row: RunRow; result: ValidationResult | null }>;
  recentRuns: RunRow[];
  recentSamples: Array<{
    ticker: string;
    tradingDate: string;
    signalTimestamp: string;
    signalMinute: number;
    score: number;
    horizon: string;
    entryPriceRaw: Nullable<number>;
    exitPriceRaw: Nullable<number>;
    netReturn: Nullable<number>;
    exitReason: string;
    tradable: boolean | null;
  }>;
  oosProtocol: Nullable<{
    protocolVersion: string;
    freezeTimestamp: string;
    modelVersion: string;
    configHash: string;
    status: string;
    frozenBy: Nullable<string>;
  }>;
  oosProgress: {
    active: boolean;
    tradingDaysCollected: number;
    tradingDaysRequired: number;
    tickersCollected: number;
    tickersRequired: number;
    signalsCollected: number;
    tradingDaysRemaining: Nullable<number>;
  };
  latestWeightProposal: WeightProposalResult | null;
  latestThresholdProposal: ThresholdSimulationResult | null;
  status: string;
  disclaimer: string;
}

export type RecentSample = Dashboard['recentSamples'][number];
export type SampleSortKey = 'signalTimestamp' | 'ticker' | 'score' | 'entryPriceRaw' | 'exitPriceRaw' | 'netReturn' | 'exitReason' | 'tradable';
export type SampleSort = { key: SampleSortKey; direction: 'asc' | 'desc' };

export type ActionName =
  | 'collect_data'
  | 'reset_research'
  | 'run_validation'
  | 'freeze_oos'
  | 'threshold_simulation'
  | 'threshold_proposal'
  | 'weight_proposal';
