export type LearningAction = 'CONFIRM' | 'CHALLENGE';

export interface LearningObservation {
  observedAt: string;
  ticker: string;
  lensScore: number;
  coveragePct: number;
  riskReward: number;
  technicalScore: number;
  fundamentalScore: number;
  flowScore: number;
  t5ReturnPct: number;
  t20ReturnPct: number;
}

export interface OfflinePolicy {
  minLensScore: number;
  minCoveragePct: number;
  minRiskReward: number;
  minTechnicalScore: number;
  minFundamentalScore: number;
  minFlowScore: number;
}

export interface PolicyMetrics {
  sampleCount: number;
  selectedCount: number;
  selectionRatePct: number;
  averageReward: number | null;
  averageT20ReturnPct: number | null;
  hitRatePct: number | null;
  downsideRatePct: number | null;
}

export interface OfflineLearningResult {
  status: 'INSUFFICIENT_DATA' | 'CHALLENGER_READY' | 'BASELINE_RETAINED';
  baseline: OfflinePolicy;
  challenger: OfflinePolicy | null;
  train: { baseline: PolicyMetrics; challenger: PolicyMetrics | null };
  validation: { baseline: PolicyMetrics; challenger: PolicyMetrics | null };
  promotionEligible: boolean;
  blockers: string[];
}

export const BASELINE_POLICY: OfflinePolicy = {
  minLensScore: 75,
  minCoveragePct: 55,
  minRiskReward: 1.5,
  minTechnicalScore: 0,
  minFundamentalScore: 0,
  minFlowScore: 0,
};

const MIN_TOTAL_SAMPLES = 60;
const MIN_VALIDATION_SAMPLES = 20;
const MIN_SELECTED_VALIDATION = 10;

export function rewardOf(row: LearningObservation): number {
  // Reward menitikberatkan outcome lebih panjang, tetapi menghukum downside T+5
  // agar policy tidak mengejar return T+20 dengan drawdown awal berlebihan.
  const downsidePenalty = Math.max(0, -row.t5ReturnPct) * 0.5;
  return row.t20ReturnPct * 0.7 + row.t5ReturnPct * 0.3 - downsidePenalty;
}

export function policySelects(policy: OfflinePolicy, row: LearningObservation): boolean {
  return row.lensScore >= policy.minLensScore
    && row.coveragePct >= policy.minCoveragePct
    && row.riskReward >= policy.minRiskReward
    && row.technicalScore >= policy.minTechnicalScore
    && row.fundamentalScore >= policy.minFundamentalScore
    && row.flowScore >= policy.minFlowScore;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function evaluatePolicy(policy: OfflinePolicy, rows: LearningObservation[]): PolicyMetrics {
  const selected = rows.filter((row) => policySelects(policy, row));
  const rewards = selected.map(rewardOf);
  return {
    sampleCount: rows.length,
    selectedCount: selected.length,
    selectionRatePct: rows.length ? selected.length / rows.length * 100 : 0,
    averageReward: average(rewards),
    averageT20ReturnPct: average(selected.map((row) => row.t20ReturnPct)),
    hitRatePct: selected.length ? selected.filter((row) => row.t20ReturnPct > 0).length / selected.length * 100 : null,
    downsideRatePct: selected.length ? selected.filter((row) => row.t20ReturnPct < 0).length / selected.length * 100 : null,
  };
}

function candidatePolicies(): OfflinePolicy[] {
  const policies: OfflinePolicy[] = [];
  for (const minLensScore of [75, 78, 80, 82])
    for (const minCoveragePct of [55, 60, 65, 70])
      for (const minRiskReward of [1.5, 1.75, 2])
        for (const minComponentScore of [0, 45, 50, 55])
          policies.push({
            minLensScore, minCoveragePct, minRiskReward,
            minTechnicalScore: minComponentScore,
            minFundamentalScore: minComponentScore,
            minFlowScore: minComponentScore,
          });
  return policies;
}

function score(metrics: PolicyMetrics): number {
  if (metrics.selectedCount < 10 || metrics.averageReward == null || metrics.hitRatePct == null) return Number.NEGATIVE_INFINITY;
  return metrics.averageReward + metrics.hitRatePct / 100 - (metrics.downsideRatePct ?? 100) / 200;
}

export function learnOfflinePolicy(rows: LearningObservation[], baseline = BASELINE_POLICY): OfflineLearningResult {
  const ordered = [...rows].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  const split = Math.floor(ordered.length * 0.7);
  const trainRows = ordered.slice(0, split);
  const validationRows = ordered.slice(split);
  const trainBaseline = evaluatePolicy(baseline, trainRows);
  const validationBaseline = evaluatePolicy(baseline, validationRows);
  if (ordered.length < MIN_TOTAL_SAMPLES || validationRows.length < MIN_VALIDATION_SAMPLES) {
    return {
      status: 'INSUFFICIENT_DATA', baseline, challenger: null,
      train: { baseline: trainBaseline, challenger: null },
      validation: { baseline: validationBaseline, challenger: null },
      promotionEligible: false,
      blockers: [`Butuh minimal ${MIN_TOTAL_SAMPLES} observasi dan ${MIN_VALIDATION_SAMPLES} observasi validasi.`],
    };
  }

  const ranked = candidatePolicies()
    .map((policy) => ({ policy, metrics: evaluatePolicy(policy, trainRows) }))
    .sort((a, b) => score(b.metrics) - score(a.metrics));
  const challenger = ranked[0]?.policy ?? null;
  const trainChallenger = challenger ? evaluatePolicy(challenger, trainRows) : null;
  const validationChallenger = challenger ? evaluatePolicy(challenger, validationRows) : null;
  const blockers: string[] = [];
  if (!validationChallenger || validationChallenger.selectedCount < MIN_SELECTED_VALIDATION) blockers.push(`Challenger butuh minimal ${MIN_SELECTED_VALIDATION} pilihan pada validation set.`);
  if ((validationChallenger?.averageReward ?? Number.NEGATIVE_INFINITY) <= (validationBaseline.averageReward ?? Number.NEGATIVE_INFINITY)) blockers.push('Reward validation challenger belum mengalahkan baseline.');
  if ((validationChallenger?.hitRatePct ?? 0) < (validationBaseline.hitRatePct ?? 0)) blockers.push('Hit rate validation challenger lebih rendah dari baseline.');
  if ((validationChallenger?.downsideRatePct ?? 100) > (validationBaseline.downsideRatePct ?? 100)) blockers.push('Downside rate validation challenger lebih buruk dari baseline.');
  const promotionEligible = blockers.length === 0;
  return {
    status: promotionEligible ? 'CHALLENGER_READY' : 'BASELINE_RETAINED',
    baseline, challenger,
    train: { baseline: trainBaseline, challenger: trainChallenger },
    validation: { baseline: validationBaseline, challenger: validationChallenger },
    promotionEligible,
    blockers,
  };
}
