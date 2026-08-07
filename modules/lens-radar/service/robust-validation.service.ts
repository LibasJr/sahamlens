export interface RobustValidationObservation {
  ticker: string;
  signalDate: string;
  lensScore: number;
  bucket: '80-100' | '70-79' | '60-69' | '<60';
  returnT20: number | null;
}

export type BootstrapEvidenceStatus = 'SUPPORTIVE' | 'INCONCLUSIVE' | 'NEGATIVE' | 'INSUFFICIENT_DATA';

export interface BootstrapSpreadResult {
  method: 'calendar-week block bootstrap';
  iterations: number;
  spreadMean: number | null;
  ci95Low: number | null;
  ci95High: number | null;
  excludesZero: boolean;
  status: BootstrapEvidenceStatus;
}

export interface PermutationSpreadResult {
  method: 'within-week label permutation';
  iterations: number;
  observedSpread: number | null;
  pValueOneTailed: number | null;
  significant: boolean;
}

export interface InformationCoefficientResult {
  method: 'Spearman rank IC';
  samples: number;
  ic: number | null;
}

export interface MonthlyInformationCoefficientRow {
  month: string;
  samples: number;
  ic: number;
}

export interface MonthlyInformationCoefficientResult {
  method: 'monthly Spearman rank IC';
  minSamplesPerMonth: number;
  months: number;
  positiveMonths: number;
  positiveMonthPct: number | null;
  meanIc: number | null;
  stdDevIc: number | null;
  icir: number | null;
  rows: MonthlyInformationCoefficientRow[];
}

export interface MonotonicityResult {
  orderedBuckets: Array<{ bucket: RobustValidationObservation['bucket']; avgReturnT20: number | null; samples: number }>;
  positiveSteps: number;
  totalSteps: number;
  score: number | null;
}

export interface RobustValidationResult {
  sampleBasis: 'effective non-overlapping T+20 observations';
  effectiveSamples: number;
  highBucketSamples: number;
  lowBucketSamples: number;
  bootstrap: BootstrapSpreadResult;
  permutation: PermutationSpreadResult;
  informationCoefficient: InformationCoefficientResult;
  monthlyInformationCoefficient: MonthlyInformationCoefficientResult;
  monotonicity: MonotonicityResult;
}

function finite(values: number[]): number[] {
  return values.filter(Number.isFinite);
}

function mean(values: number[]): number | null {
  const xs = finite(values);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function round(value: number | null, digits = 4): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo] ?? null;
  const w = index - lo;
  return (sorted[lo] ?? 0) * (1 - w) + (sorted[hi] ?? 0) * w;
}

// Deterministic PRNG so admin statistics are reproducible for the same dataset.
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

function hashSeed(rows: RobustValidationObservation[]): number {
  let h = 2166136261;
  for (const row of rows) {
    const s = `${row.ticker}|${row.signalDate}|${row.lensScore}|${row.returnT20 ?? ''}`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

function spread(high: number[], low: number[]): number | null {
  const a = mean(high);
  const b = mean(low);
  return a == null || b == null ? null : a - b;
}

function calendarWeekKey(dateKey: string): string {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateKey;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function groupByCalendarWeek(observations: RobustValidationObservation[]): Map<string, RobustValidationObservation[]> {
  const map = new Map<string, RobustValidationObservation[]>();
  for (const obs of observations) {
    if (typeof obs.returnT20 !== 'number' || !Number.isFinite(obs.returnT20)) continue;
    const key = calendarWeekKey(obs.signalDate);
    const bucket = map.get(key) ?? [];
    bucket.push(obs);
    map.set(key, bucket);
  }
  return map;
}

export function dateBlockBootstrapSpread(
  observations: RobustValidationObservation[],
  iterations = 2000
): BootstrapSpreadResult {
  const blocks = Array.from(groupByCalendarWeek(observations).values());
  const highRaw = observations.filter((x) => x.bucket === '80-100' && typeof x.returnT20 === 'number').map((x) => x.returnT20 as number);
  const lowRaw = observations.filter((x) => x.bucket === '<60' && typeof x.returnT20 === 'number').map((x) => x.returnT20 as number);
  const observed = spread(highRaw, lowRaw);
  if (blocks.length < 2 || observed == null) {
    return { method: 'calendar-week block bootstrap', iterations: 0, spreadMean: observed, ci95Low: null, ci95High: null, excludesZero: false, status: 'INSUFFICIENT_DATA' };
  }

  const rng = mulberry32(hashSeed(observations) ^ 0xB0057A9);
  const draws: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const high: number[] = [];
    const low: number[] = [];
    for (let j = 0; j < blocks.length; j++) {
      const block = blocks[Math.floor(rng() * blocks.length)] ?? [];
      for (const obs of block) {
        if (obs.bucket === '80-100') high.push(obs.returnT20 as number);
        else if (obs.bucket === '<60') low.push(obs.returnT20 as number);
      }
    }
    const s = spread(high, low);
    if (s != null) draws.push(s);
  }
  draws.sort((a, b) => a - b);
  const low = percentile(draws, 0.025);
  const high = percentile(draws, 0.975);
  const status: BootstrapEvidenceStatus = low == null || high == null
    ? 'INSUFFICIENT_DATA'
    : low > 0
      ? 'SUPPORTIVE'
      : high < 0
        ? 'NEGATIVE'
        : 'INCONCLUSIVE';
  return {
    method: 'calendar-week block bootstrap',
    iterations: draws.length,
    spreadMean: round(mean(draws)),
    ci95Low: round(low),
    ci95High: round(high),
    excludesZero: status === 'SUPPORTIVE' || status === 'NEGATIVE',
    status,
  };
}

export function dateBlockPermutationSpread(
  observations: RobustValidationObservation[],
  iterations = 2000
): PermutationSpreadResult {
  const blocks = Array.from(groupByCalendarWeek(observations).values())
    .map((rows) => rows.filter((x) => x.bucket === '80-100' || x.bucket === '<60'))
    .filter((rows) => rows.length > 0);
  const highRaw = observations.filter((x) => x.bucket === '80-100' && typeof x.returnT20 === 'number').map((x) => x.returnT20 as number);
  const lowRaw = observations.filter((x) => x.bucket === '<60' && typeof x.returnT20 === 'number').map((x) => x.returnT20 as number);
  const observed = spread(highRaw, lowRaw);
  if (blocks.length < 2 || observed == null || !highRaw.length || !lowRaw.length) {
    return { method: 'within-week label permutation', iterations: 0, observedSpread: round(observed), pValueOneTailed: null, significant: false };
  }

  const rng = mulberry32(hashSeed(observations) ^ 0xC0FFEE);
  let atLeastObserved = 0;
  let valid = 0;
  for (let i = 0; i < iterations; i++) {
    const high: number[] = [];
    const low: number[] = [];
    for (const block of blocks) {
      const values = block.map((x) => x.returnT20 as number);
      const highCount = block.filter((x) => x.bucket === '80-100').length;
      for (let k = values.length - 1; k > 0; k--) {
        const j = Math.floor(rng() * (k + 1));
        [values[k], values[j]] = [values[j]!, values[k]!];
      }
      high.push(...values.slice(0, highCount));
      low.push(...values.slice(highCount));
    }
    const s = spread(high, low);
    if (s == null) continue;
    valid++;
    if (s >= observed) atLeastObserved++;
  }
  const p = valid ? (atLeastObserved + 1) / (valid + 1) : null;
  return {
    method: 'within-week label permutation',
    iterations: valid,
    observedSpread: round(observed),
    pValueOneTailed: round(p),
    significant: p != null && p < 0.05,
  };
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

export function spearmanInformationCoefficient(observations: RobustValidationObservation[]): InformationCoefficientResult {
  const rows = observations.filter((x) => typeof x.returnT20 === 'number' && Number.isFinite(x.returnT20) && Number.isFinite(x.lensScore));
  const ic = pearson(rank(rows.map((x) => x.lensScore)), rank(rows.map((x) => x.returnT20 as number)));
  return { method: 'Spearman rank IC', samples: rows.length, ic: round(ic) };
}

function sampleStdDev(values: number[]): number | null {
  const xs = finite(values);
  if (xs.length < 2) return null;
  const avg = mean(xs)!;
  const variance = xs.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

export function monthlySpearmanInformationCoefficient(
  observations: RobustValidationObservation[],
  minSamplesPerMonth = 20
): MonthlyInformationCoefficientResult {
  const grouped = new Map<string, RobustValidationObservation[]>();
  for (const obs of observations) {
    if (typeof obs.returnT20 !== 'number' || !Number.isFinite(obs.returnT20) || !Number.isFinite(obs.lensScore)) continue;
    const month = obs.signalDate.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const rows = grouped.get(month) ?? [];
    rows.push(obs);
    grouped.set(month, rows);
  }

  const rows: MonthlyInformationCoefficientRow[] = [];
  for (const [month, monthRows] of Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    if (monthRows.length < minSamplesPerMonth) continue;
    const ic = spearmanInformationCoefficient(monthRows).ic;
    if (ic == null || !Number.isFinite(ic)) continue;
    rows.push({ month, samples: monthRows.length, ic });
  }

  const values = rows.map((row) => row.ic);
  const meanIc = mean(values);
  const stdDevIc = sampleStdDev(values);
  const icir = meanIc != null && stdDevIc != null && stdDevIc > 0 ? meanIc / stdDevIc : null;
  const positiveMonths = rows.filter((row) => row.ic > 0).length;
  return {
    method: 'monthly Spearman rank IC',
    minSamplesPerMonth,
    months: rows.length,
    positiveMonths,
    positiveMonthPct: rows.length ? round((positiveMonths / rows.length) * 100, 2) : null,
    meanIc: round(meanIc),
    stdDevIc: round(stdDevIc),
    icir: round(icir),
    rows,
  };
}

export function bucketMonotonicity(observations: RobustValidationObservation[]): MonotonicityResult {
  const order: RobustValidationObservation['bucket'][] = ['<60', '60-69', '70-79', '80-100'];
  const orderedBuckets = order.map((bucket) => {
    const values = observations.filter((x) => x.bucket === bucket && typeof x.returnT20 === 'number').map((x) => x.returnT20 as number);
    return { bucket, avgReturnT20: round(mean(values)), samples: values.length };
  });
  let positiveSteps = 0;
  let totalSteps = 0;
  for (let i = 1; i < orderedBuckets.length; i++) {
    const prev = orderedBuckets[i - 1]!.avgReturnT20;
    const cur = orderedBuckets[i]!.avgReturnT20;
    if (prev == null || cur == null) continue;
    totalSteps++;
    if (cur > prev) positiveSteps++;
  }
  return { orderedBuckets, positiveSteps, totalSteps, score: totalSteps ? round(positiveSteps / totalSteps, 3) : null };
}

export function buildRobustValidation(observations: RobustValidationObservation[]): RobustValidationResult {
  const effective = observations.filter((x) => typeof x.returnT20 === 'number' && Number.isFinite(x.returnT20));
  return {
    sampleBasis: 'effective non-overlapping T+20 observations',
    effectiveSamples: effective.length,
    highBucketSamples: effective.filter((x) => x.bucket === '80-100').length,
    lowBucketSamples: effective.filter((x) => x.bucket === '<60').length,
    bootstrap: dateBlockBootstrapSpread(effective),
    permutation: dateBlockPermutationSpread(effective),
    informationCoefficient: spearmanInformationCoefficient(effective),
    monthlyInformationCoefficient: monthlySpearmanInformationCoefficient(effective),
    monotonicity: bucketMonotonicity(effective),
  };
}
