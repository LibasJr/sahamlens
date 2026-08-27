// Tipe payload Calibration Lab (admin). Dipisah dari komponen supaya section-section
// presentasi bisa mengimpornya tanpa menyeret logic React. Sumber kebenaran tetap
// bentuk yang dikirim server.

export type Bucket = '80-100' | '70-79' | '60-69' | '<60';

export interface CalibrationBucketChartRow {
  bucket: Bucket;
  avgReturnT20: number | null;
  totalSamples: number;
}

export interface CalibrationTTestResult {
  comparison: '80-100 > <60';
  method: 'Welch one-tailed t-test';
  highBucketSamples: number;
  lowBucketSamples: number;
  highAvgT20: number | null;
  lowAvgT20: number | null;
  tStatistic: number | null;
  degreesOfFreedom: number | null;
  pValue: number | null;
  significant: boolean;
  conclusion: string;
}

export interface ThresholdSimulation {
  threshold: number;
  avgReturnT20: number | null;
  medianReturnT20: number | null;
  meanMedianGapT20: number | null;
  distributionWarning: 'MEAN_POSITIVE_MEDIAN_NEGATIVE' | null;
  winRateT20: number | null;
  avgWinT20: number | null;
  avgLossT20: number | null;
  expectancyT20: number | null;
  profitFactorT20: number | null;
  totalSignals: number;
  signalDeltaPctVs80: number | null;
  winRateDeltaPctVs80: number | null;
}

export interface LensScoreWeights {
  technical: number;
  fundamental: number;
  flow: number;
}

export interface LensWeightProposal {
  id?: number;
  runDate: string;
  status: 'PENDING_APPROVAL' | 'INSUFFICIENT_STATS' | 'INSUFFICIENT_COMPONENT_HISTORY' | 'NO_VALID_CANDIDATE';
  reason: string;
  baselineWeights: LensScoreWeights;
  proposedWeights: LensScoreWeights | null;
  baselineSpreadT20: number | null;
  proposedSpreadT20: number | null;
  baselinePValue: number | null;
  proposedPValue: number | null;
  baselineSampleSize: number;
  proposedSampleSize: number;
  componentSampleSize: number;
  candidateCount: number;
  lookbackDays: number;
  statsWindowStart: string | null;
  statsWindowEnd: string | null;
  createdAt?: string;
}

export interface RobustValidationResult {
  sampleBasis: string;
  audit: { version: 'rv-2.1'; deterministic: true; datasetHash: string; observations: number; firstSignalDate: string | null; lastSignalDate: string | null; bootstrapSeed: number; permutationSeed: number; bootstrapIterationsRequested: number; permutationIterationsRequested: number };
  effectiveSamples: number;
  highBucketSamples: number;
  lowBucketSamples: number;
  bootstrap: { iterations: number; spreadMean: number | null; ci95Low: number | null; ci95High: number | null; excludesZero: boolean; status: 'SUPPORTIVE' | 'INCONCLUSIVE' | 'NEGATIVE' | 'INSUFFICIENT_DATA' };
  permutation: { iterations: number; observedSpread: number | null; pValueOneTailed: number | null; significant: boolean };
  informationCoefficient: { samples: number; ic: number | null };
  monthlyInformationCoefficient: { minSamplesPerMonth: number; months: number; positiveMonths: number; positiveMonthPct: number | null; meanIc: number | null; stdDevIc: number | null; icir: number | null; rows: Array<{ month: string; samples: number; ic: number }> };
  monotonicity: { positiveSteps: number; totalSteps: number; score: number | null };
}

export interface RetrospectiveWalkForwardResult {
  method: 'retrospective contiguous temporal holdout diagnostic';
  genuineOos: false;
  foldsRequested: number;
  foldsCompleted: number;
  positiveSpreadFolds: number;
  positiveSpreadPct: number | null;
  rows: Array<{ fold: number; startDate: string; endDate: string; samples: number; highSamples: number; lowSamples: number; highAvgT20: number | null; lowAvgT20: number | null; spreadT20: number | null; ic: number | null; positiveSpread: boolean }>;
  conclusion: string;
}

export interface GenuineOosResult {
  protocolVersion: string;
  scoreVersion: string;
  freezeDate: string;
  rule: string;
  status: 'WAITING_FOR_MATURITY' | 'INSUFFICIENT_SAMPLE' | 'PASS' | 'FAIL';
  matureRawSamples: number;
  matureEffectiveSamples: number;
  highBucketSamples: number;
  lowBucketSamples: number;
  firstSignalDate: string | null;
  lastSignalDate: string | null;
  gate: { minEffectivePerEdgeBucket: number; spreadPositive: boolean; bootstrapSupportive: boolean; permutationPass: boolean; icPositive: boolean; monotonicityPass: boolean };
  conclusion: string;
}

export interface ReliabilityBin {
  binLow: number;
  binHigh: number;
  samples: number;
  wins: number;
  meanScore: number;
  predicted: number;
  observed: number;
  wilsonLow: number;
  wilsonHigh: number;
  reliable: boolean;
  predictionWithinCi: boolean;
}

export interface CalibrationMetrics {
  samples: number;
  baseRate: number;
  ece: number;
  brier: number;
  brierBaseRate: number;
  brierSkillScore: number;
}

export interface ScoreCalibrationResult {
  protocolVersion: string;
  outcomeRule: string;
  status: 'WAITING_FOR_MATURITY' | 'INSUFFICIENT_SAMPLE' | 'REPORTED';
  samples: number;
  binWidth: number;
  minSamplesPerReliableBin: number;
  reliableBins: number;
  bins: ReliabilityBin[];
  naive: CalibrationMetrics | null;
  isotonic: {
    method: string;
    fitted: boolean;
    splitDate: string | null;
    trainSamples: number;
    testSamples: number;
    curve: Array<{ score: number; probability: number }>;
    naiveOnTest: CalibrationMetrics | null;
    isotonicOnTest: CalibrationMetrics | null;
    improvesBrierOutOfSample: boolean;
    note: string;
  };
  naiveMappingRejectedBins: number;
  naiveMappingRejected: boolean;
  conclusion: string;
}

export interface FundamentalPitCoverageDiagnostic {
  totalRows: number;
  rowsWithFundamental: number;
  coveragePct: number | null;
  status: 'NO_HISTORY' | 'NO_FUNDAMENTAL_COVERAGE' | 'MIXED_FUNDAMENTAL_COVERAGE' | 'FULL_FUNDAMENTAL_COVERAGE';
  byDate: Array<{ date: string; totalRows: number; rowsWithFundamental: number; coveragePct: number }>;
  note: string;
}

export interface CalibrationDashboardData {
  asOfDate: string;
  latestStatsRunDate: string | null;
  scoreVersion: string | null;
  requestedScoreVersion: string;
  scoreConfigHash: string;
  configRejectedRows: number;
  rejectedRows: number;
  versionRejectedReason: string | null;
  sourceRows: number;
  uniqueTickers: number;
  observationsT20: number;
  chart: CalibrationBucketChartRow[];
  chartSource: 'live-calibration-observations';
  cronComparison: { runDate: string | null; liveHighBucketSamples: number; cronHighBucketSamples: number | null; deltaHighBucketSamples: number | null; populationMismatch: boolean; note: string };
  tTest: CalibrationTTestResult;
  robustValidation: RobustValidationResult;
  retrospectiveWalkForward: RetrospectiveWalkForwardResult;
  genuineOos: GenuineOosResult;
  scoreCalibration: ScoreCalibrationResult;
  fundamentalPitCoverage: FundamentalPitCoverageDiagnostic;
  thresholdSimulations: ThresholdSimulation[];
  latestWeightProposal: LensWeightProposal | null;
}

export interface ThresholdRecommendation {
  threshold: number | null;
  text: string;
  aiGenerated: boolean;
  supportingSimulation: ThresholdSimulation | null;
  baseline80: ThresholdSimulation | null;
}
