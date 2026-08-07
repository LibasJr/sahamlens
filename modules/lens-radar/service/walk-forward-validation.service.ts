import { SCORE_VERSION } from '../constants/model-version';
import { buildRobustValidation, type RobustValidationResult } from './robust-validation.service';

export const LENS_RADAR_OOS_PROTOCOL_VERSION = 'oos-v1.0' as const;
// Freeze point is intentionally explicit and forward-only. Historical rows before this
// date can support research diagnostics, but can never be re-labelled as genuine OOS.
export const LENS_RADAR_OOS_FREEZE_DATE = '2026-08-07' as const;
export const LENS_RADAR_OOS_MIN_EFFECTIVE_PER_EDGE_BUCKET = 30;

export interface WalkForwardObservation {
  ticker: string;
  signalDate: string;
  exitDateT20: string | null;
  lensScore: number;
  bucket: '80-100' | '70-79' | '60-69' | '<60';
  returnT20: number | null;
}

export interface TemporalFoldRow {
  fold: number;
  startDate: string;
  endDate: string;
  samples: number;
  highSamples: number;
  lowSamples: number;
  highAvgT20: number | null;
  lowAvgT20: number | null;
  spreadT20: number | null;
  ic: number | null;
  positiveSpread: boolean;
}

export interface RetrospectiveWalkForwardResult {
  method: 'retrospective contiguous temporal holdout diagnostic';
  genuineOos: false;
  foldsRequested: number;
  foldsCompleted: number;
  positiveSpreadFolds: number;
  positiveSpreadPct: number | null;
  rows: TemporalFoldRow[];
  conclusion: string;
}

export type GenuineOosStatus =
  | 'WAITING_FOR_MATURITY'
  | 'INSUFFICIENT_SAMPLE'
  | 'PASS'
  | 'FAIL';

export interface GenuineOosResult {
  protocolVersion: typeof LENS_RADAR_OOS_PROTOCOL_VERSION;
  scoreVersion: string;
  freezeDate: string;
  rule: 'signalDate > freezeDate and T+20 exit matured after freeze';
  status: GenuineOosStatus;
  matureRawSamples: number;
  matureEffectiveSamples: number;
  highBucketSamples: number;
  lowBucketSamples: number;
  firstSignalDate: string | null;
  lastSignalDate: string | null;
  robustValidation: RobustValidationResult;
  gate: {
    minEffectivePerEdgeBucket: number;
    spreadPositive: boolean;
    bootstrapSupportive: boolean;
    permutationPass: boolean;
    icPositive: boolean;
    monotonicityPass: boolean;
  };
  conclusion: string;
}

function round(value: number | null, digits = 4): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function mean(values: number[]): number | null {
  const xs = values.filter(Number.isFinite);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function rank(values: number[]): number[] {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j]!.value === sorted[i]!.value) j++;
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) out[sorted[k]!.index] = avgRank;
    i = j;
  }
  return out;
}

function pearson(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 3) return null;
  const ma = mean(a)!;
  const mb = mean(b)!;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    const xa = a[i]! - ma;
    const xb = b[i]! - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den > 0 ? num / den : null;
}

function foldMetrics(rows: WalkForwardObservation[], fold: number): TemporalFoldRow | null {
  const valid = rows.filter((x) => typeof x.returnT20 === 'number' && Number.isFinite(x.returnT20));
  if (!valid.length) return null;
  const high = valid.filter((x) => x.bucket === '80-100').map((x) => x.returnT20 as number);
  const low = valid.filter((x) => x.bucket === '<60').map((x) => x.returnT20 as number);
  const highAvg = mean(high);
  const lowAvg = mean(low);
  const ic = pearson(rank(valid.map((x) => x.lensScore)), rank(valid.map((x) => x.returnT20 as number)));
  const dates = valid.map((x) => x.signalDate).sort();
  const spread = highAvg == null || lowAvg == null ? null : highAvg - lowAvg;
  return {
    fold,
    startDate: dates[0]!,
    endDate: dates[dates.length - 1]!,
    samples: valid.length,
    highSamples: high.length,
    lowSamples: low.length,
    highAvgT20: round(highAvg),
    lowAvgT20: round(lowAvg),
    spreadT20: round(spread),
    ic: round(ic),
    positiveSpread: spread != null && spread > 0,
  };
}

export function buildRetrospectiveWalkForward(
  effectiveObservations: WalkForwardObservation[],
  foldsRequested = 4
): RetrospectiveWalkForwardResult {
  const valid = effectiveObservations
    .filter((x) => typeof x.returnT20 === 'number' && Number.isFinite(x.returnT20))
    .sort((a, b) => a.signalDate.localeCompare(b.signalDate) || a.ticker.localeCompare(b.ticker));
  const dates = [...new Set(valid.map((x) => x.signalDate))];
  if (dates.length < foldsRequested * 2) {
    return {
      method: 'retrospective contiguous temporal holdout diagnostic', genuineOos: false,
      foldsRequested, foldsCompleted: 0, positiveSpreadFolds: 0, positiveSpreadPct: null, rows: [],
      conclusion: 'Tanggal efektif belum cukup untuk temporal holdout yang bermakna. Ini tetap bukan genuine OOS.',
    };
  }

  const rows: TemporalFoldRow[] = [];
  for (let i = 0; i < foldsRequested; i++) {
    const start = Math.floor((i * dates.length) / foldsRequested);
    const end = Math.floor(((i + 1) * dates.length) / foldsRequested);
    const dateSet = new Set(dates.slice(start, end));
    const metric = foldMetrics(valid.filter((x) => dateSet.has(x.signalDate)), i + 1);
    if (metric) rows.push(metric);
  }
  const positive = rows.filter((x) => x.positiveSpread).length;
  return {
    method: 'retrospective contiguous temporal holdout diagnostic',
    genuineOos: false,
    foldsRequested,
    foldsCompleted: rows.length,
    positiveSpreadFolds: positive,
    positiveSpreadPct: rows.length ? round((positive / rows.length) * 100, 2) : null,
    rows,
    conclusion: 'Fold historis hanya menguji kestabilan temporal. Karena model sudah pernah dikembangkan dengan akses ke periode historis ini, hasil ini tidak boleh disebut genuine out-of-sample.',
  };
}

export function buildGenuineOosValidation(
  rawObservations: WalkForwardObservation[],
  effectiveObservations: WalkForwardObservation[],
  options: { asOfDate: string; scoreVersion?: string } 
): GenuineOosResult {
  const scoreVersion = options.scoreVersion || SCORE_VERSION;
  const isMature = (x: WalkForwardObservation) =>
    x.signalDate > LENS_RADAR_OOS_FREEZE_DATE
    && typeof x.returnT20 === 'number'
    && !!x.exitDateT20
    && x.exitDateT20 <= options.asOfDate;
  const raw = rawObservations.filter(isMature);
  const effective = effectiveObservations.filter(isMature);
  const robust = buildRobustValidation(effective);
  const dates = effective.map((x) => x.signalDate).sort();
  const spread = robust.permutation.observedSpread;
  const gate = {
    minEffectivePerEdgeBucket: LENS_RADAR_OOS_MIN_EFFECTIVE_PER_EDGE_BUCKET,
    spreadPositive: spread != null && spread > 0,
    bootstrapSupportive: robust.bootstrap.status === 'SUPPORTIVE',
    permutationPass: robust.permutation.pValueOneTailed != null && robust.permutation.pValueOneTailed <= 0.05,
    icPositive: robust.informationCoefficient.ic != null && robust.informationCoefficient.ic > 0,
    monotonicityPass: robust.monotonicity.totalSteps > 0 && robust.monotonicity.positiveSteps >= 2,
  };

  let status: GenuineOosStatus;
  let conclusion: string;
  if (!raw.length) {
    status = 'WAITING_FOR_MATURITY';
    conclusion = `Protocol genuine OOS dibekukan pada ${LENS_RADAR_OOS_FREEZE_DATE}. Hanya sinyal setelah freeze yang boleh masuk; tunggu return T+20 matang. Histori lama tidak akan di-backfill sebagai OOS.`;
  } else if (robust.highBucketSamples < LENS_RADAR_OOS_MIN_EFFECTIVE_PER_EDGE_BUCKET || robust.lowBucketSamples < LENS_RADAR_OOS_MIN_EFFECTIVE_PER_EDGE_BUCKET) {
    status = 'INSUFFICIENT_SAMPLE';
    conclusion = `Sudah ada observasi forward yang matang, tetapi belum mencapai ${LENS_RADAR_OOS_MIN_EFFECTIVE_PER_EDGE_BUCKET} sampel efektif pada masing-masing bucket edge (80-100 dan <60).`;
  } else {
    const pass = gate.spreadPositive && gate.bootstrapSupportive && gate.permutationPass && gate.icPositive && gate.monotonicityPass;
    status = pass ? 'PASS' : 'FAIL';
    conclusion = pass
      ? 'Genuine forward OOS memenuhi gate statistik protocol oos-v1.0. Status produk tetap memerlukan review/approval manual; tidak ada auto-promotion.'
      : 'Genuine forward OOS sudah cukup sampel tetapi gagal satu atau lebih gate robustness. Jangan promosikan model ke validated tanpa investigasi/revisi protocol.';
  }

  return {
    protocolVersion: LENS_RADAR_OOS_PROTOCOL_VERSION,
    scoreVersion,
    freezeDate: LENS_RADAR_OOS_FREEZE_DATE,
    rule: 'signalDate > freezeDate and T+20 exit matured after freeze',
    status,
    matureRawSamples: raw.length,
    matureEffectiveSamples: effective.length,
    highBucketSamples: robust.highBucketSamples,
    lowBucketSamples: robust.lowBucketSamples,
    firstSignalDate: dates[0] ?? null,
    lastSignalDate: dates[dates.length - 1] ?? null,
    robustValidation: robust,
    gate,
    conclusion,
  };
}
