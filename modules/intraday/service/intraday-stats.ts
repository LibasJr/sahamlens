// Statistik LensIntraday. Fungsi murni, deterministik (PRNG ber-seed dari data),
// tanpa I/O - supaya angka yang tampil di panel admin bisa direproduksi persis.
//
// Kenapa TIDAK memakai ulang modules/lens-radar/service/robust-validation.service.ts:
// fungsi di sana terikat pada `returnT20` dan pada dua bucket tetap ('80-100' vs
// '<60') milik LensScore. Memaksakannya ke sini berarti mencampur dua model yang
// sengaja dipisahkan. Yang DIPAKAI ULANG adalah wilsonInterval/calibrationMetrics/
// isotonic dari score-calibration.service.ts, karena itu murni fungsi statistik
// tanpa asumsi horizon.

// ---------------------------------------------------------------------------
// Observasi
// ---------------------------------------------------------------------------

export interface IntradayObservation {
  ticker: string;
  tradingDate: string;
  signalMinute: number;
  score: number;
  netReturn: number;
  grossReturn: number;
  sector: string | null;
  turnoverIdr: number;
}

export function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function percentile(sortedAsc: number[], p: number): number | null {
  if (!sortedAsc.length) return null;
  const index = (sortedAsc.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sortedAsc[lo]!;
  return sortedAsc[lo]! * (hi - index) + sortedAsc[hi]! * (index - lo);
}

export function round(value: number | null, digits = 6): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

// ---------------------------------------------------------------------------
// Sampel efektif - klaster (ticker, hari bursa)
// ---------------------------------------------------------------------------

export interface EffectiveSample {
  raw: number;
  effective: number;
  distinctTickers: number;
  distinctDays: number;
  /** Rata-rata net return per klaster (ticker, hari). Ini populasi untuk uji statistik. */
  clusterMeans: Array<{ ticker: string; tradingDate: string; netReturn: number; score: number }>;
}

/**
 * Delapan sinyal untuk emiten yang sama pada hari yang sama BUKAN delapan pengamatan
 * independen - mereka membaca sesi yang sama, dan return-nya tumpang tindih. Yang
 * dipakai sebagai satuan uji adalah RATA-RATA per klaster (ticker, hari bursa).
 * Cara ini konservatif dan tetap memakai semua data, bukan membuang tujuh baris.
 */
export function toEffectiveSample(observations: IntradayObservation[]): EffectiveSample {
  const clusters = new Map<string, IntradayObservation[]>();
  for (const obs of observations) {
    const key = `${obs.ticker}|${obs.tradingDate}`;
    const list = clusters.get(key);
    if (list) list.push(obs);
    else clusters.set(key, [obs]);
  }
  const clusterMeans = Array.from(clusters.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rows]) => {
      const [ticker, tradingDate] = key.split('|');
      return {
        ticker: ticker!,
        tradingDate: tradingDate!,
        netReturn: mean(rows.map((r) => r.netReturn))!,
        score: mean(rows.map((r) => r.score))!,
      };
    });

  return {
    raw: observations.length,
    effective: clusterMeans.length,
    distinctTickers: new Set(observations.map((o) => o.ticker)).size,
    distinctDays: new Set(observations.map((o) => o.tradingDate)).size,
    clusterMeans,
  };
}

// ---------------------------------------------------------------------------
// Metrik performa
// ---------------------------------------------------------------------------

export interface PerformanceMetrics {
  samplesRaw: number;
  samplesEffective: number;
  winRate: number | null;
  avgNetReturn: number | null;
  medianNetReturn: number | null;
  avgGrossReturn: number | null;
  /** Ekspektasi per trade dalam basis point net. */
  expectancyBps: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  payoffRatio: number | null;
  profitFactor: number | null;
  /**
   * Rentetan kerugian terburuk pada RANGKAIAN SINYAL (jumlah kumulatif aditif).
   * BUKAN drawdown ekuitas akun - sinyal di sini tumpang tindih dan tidak ada asumsi
   * alokasi modal. Dipertahankan sebagai ukuran rentetan, bukan sebagai kinerja portofolio.
   */
  maxDrawdown: number | null;
  /**
   * Drawdown EKUITAS yang bisa dibaca sebagai portofolio: satu unit modal dibagi rata
   * ke seluruh sinyal pada hari yang sama, flat semalam, lalu dimajemukkan antar hari.
   * Ini interpretasi yang benar untuk strategi intraday - posisi tidak pernah menginap,
   * jadi hari adalah satuan alami kurva ekuitasnya.
   */
  maxDrawdownDailyEquity: number | null;
  /** Berapa hari bursa dilalui kurva ekuitas di atas. */
  equityTradingDays: number;
  /** Porsi total profit yang datang dari 5% trade terbaik. */
  top5PctProfitShare: number | null;
}

/**
 * Drawdown kurva ekuitas harian yang dimajemukkan. Dipisah jadi fungsi sendiri supaya
 * bisa diuji langsung terhadap deret yang diketahui jawabannya.
 */
export function dailyEquityDrawdown(observations: IntradayObservation[]): {
  maxDrawdown: number | null;
  tradingDays: number;
} {
  const byDay = new Map<string, number[]>();
  for (const obs of observations) {
    const list = byDay.get(obs.tradingDate);
    if (list) list.push(obs.netReturn);
    else byDay.set(obs.tradingDate, [obs.netReturn]);
  }
  const days = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
  if (!days.length) return { maxDrawdown: null, tradingDays: 0 };

  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const [, returns] of days) {
    const dayReturn = mean(returns) ?? 0;
    equity *= 1 + dayReturn;
    if (equity > peak) peak = equity;
    // Modal habis total: drawdown -100% dan tidak ada yang bisa lebih buruk dari itu.
    if (equity <= 0) return { maxDrawdown: -1, tradingDays: days.length };
    const drawdown = equity / peak - 1;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }
  return { maxDrawdown: round(maxDrawdown), tradingDays: days.length };
}

/**
 * maxDrawdown dihitung atas kurva KUMULATIF ADITIF dari net return terurut waktu.
 * Ia BUKAN drawdown portofolio sungguhan: sinyal intraday di sini tumpang tindih
 * (banyak emiten pada jam yang sama), dan tidak ada asumsi alokasi modal. Angka ini
 * dibaca sebagai "rentetan kerugian terburuk pada rangkaian sinyal", bukan sebagai
 * drawdown ekuitas akun.
 */
export function computePerformance(
  observations: IntradayObservation[],
  effective: EffectiveSample
): PerformanceMetrics {
  const nets = observations.map((o) => o.netReturn);
  const wins = nets.filter((r) => r > 0);
  const losses = nets.filter((r) => r <= 0);
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));

  const ordered = [...observations].sort((a, b) =>
    a.tradingDate === b.tradingDate ? a.signalMinute - b.signalMinute : a.tradingDate.localeCompare(b.tradingDate)
  );
  let cum = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const obs of ordered) {
    cum += obs.netReturn;
    if (cum > peak) peak = cum;
    const dd = cum - peak;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }

  const equityCurve = dailyEquityDrawdown(observations);
  const sortedWins = [...wins].sort((a, b) => b - a);
  const topCount = Math.max(1, Math.round(nets.length * 0.05));
  const topProfit = sortedWins.slice(0, topCount).reduce((a, b) => a + b, 0);

  const avgNet = mean(nets);

  return {
    samplesRaw: observations.length,
    samplesEffective: effective.effective,
    winRate: nets.length ? round(wins.length / nets.length, 4) : null,
    avgNetReturn: round(avgNet),
    medianNetReturn: round(median(nets)),
    avgGrossReturn: round(mean(observations.map((o) => o.grossReturn))),
    expectancyBps: avgNet == null ? null : round(avgNet * 10_000, 2),
    avgWin: round(mean(wins)),
    avgLoss: round(mean(losses)),
    payoffRatio:
      wins.length && losses.length && Math.abs(mean(losses)!) > 0
        ? round(mean(wins)! / Math.abs(mean(losses)!), 4)
        : null,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 4) : null,
    maxDrawdown: round(maxDrawdown),
    maxDrawdownDailyEquity: equityCurve.maxDrawdown,
    equityTradingDays: equityCurve.tradingDays,
    top5PctProfitShare: grossProfit > 0 ? round(topProfit / grossProfit, 4) : null,
  };
}

// ---------------------------------------------------------------------------
// PRNG deterministik
// ---------------------------------------------------------------------------

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

export function hashObservations(rows: Array<{ ticker: string; tradingDate: string; netReturn: number }>): number {
  let h = 2166136261;
  const canonical = [...rows]
    .map((r) => `${r.ticker}|${r.tradingDate}|${r.netReturn}`)
    .sort()
    .join(';');
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function datasetHash(rows: Array<{ ticker: string; tradingDate: string; netReturn: number }>): string {
  return `fnv1a32-${hashObservations(rows).toString(16).padStart(8, '0')}`;
}

// ---------------------------------------------------------------------------
// Block bootstrap & permutation
// ---------------------------------------------------------------------------

export interface BootstrapResult {
  method: string;
  iterations: number;
  pointEstimate: number | null;
  ci95Low: number | null;
  ci95High: number | null;
  excludesZero: boolean;
  status: 'SUPPORTIVE' | 'INCONCLUSIVE' | 'NEGATIVE' | 'INSUFFICIENT_DATA';
}

/**
 * Blok = HARI BURSA. Sinyal dalam satu hari berkorelasi lewat kondisi pasar hari itu;
 * bootstrap per baris akan menganggapnya independen dan mempersempit interval secara
 * keliru.
 */
export function tradingDayBlockBootstrapMean(
  observations: IntradayObservation[],
  iterations = 2000
): BootstrapResult {
  const byDay = new Map<string, number[]>();
  for (const obs of observations) {
    const list = byDay.get(obs.tradingDate);
    if (list) list.push(obs.netReturn);
    else byDay.set(obs.tradingDate, [obs.netReturn]);
  }
  const blocks = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, values]) => values);
  const observed = mean(observations.map((o) => o.netReturn));

  if (blocks.length < 5 || observed == null) {
    return {
      method: 'trading-day block bootstrap (mean net return)',
      iterations: 0,
      pointEstimate: round(observed),
      ci95Low: null,
      ci95High: null,
      excludesZero: false,
      status: 'INSUFFICIENT_DATA',
    };
  }

  const rng = mulberry32((hashObservations(observations) ^ 0x1d7a0b00) >>> 0);
  const draws: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    let count = 0;
    for (let j = 0; j < blocks.length; j++) {
      const block = blocks[Math.floor(rng() * blocks.length)]!;
      for (const value of block) {
        sum += value;
        count++;
      }
    }
    if (count > 0) draws.push(sum / count);
  }
  draws.sort((a, b) => a - b);
  const low = percentile(draws, 0.025);
  const high = percentile(draws, 0.975);
  const status =
    low == null || high == null ? 'INSUFFICIENT_DATA' : low > 0 ? 'SUPPORTIVE' : high < 0 ? 'NEGATIVE' : 'INCONCLUSIVE';

  return {
    method: 'trading-day block bootstrap (mean net return)',
    iterations: draws.length,
    pointEstimate: round(observed),
    ci95Low: round(low),
    ci95High: round(high),
    excludesZero: status === 'SUPPORTIVE' || status === 'NEGATIVE',
    status,
  };
}

export interface PermutationResult {
  method: string;
  iterations: number;
  observed: number | null;
  pValueOneTailed: number | null;
}

/**
 * Sign-flip per HARI BURSA. Hipotesis nol: distribusi return simetris di sekitar nol
 * dalam blok waktu yang sebanding. Pengacakan dibatasi pada blok hari - tidak
 * mencampur sinyal pagi hari volatil dengan sinyal sore hari sepi.
 */
export function tradingDayBlockSignFlipTest(
  observations: IntradayObservation[],
  iterations = 2000
): PermutationResult {
  const byDay = new Map<string, number[]>();
  for (const obs of observations) {
    const list = byDay.get(obs.tradingDate);
    if (list) list.push(obs.netReturn);
    else byDay.set(obs.tradingDate, [obs.netReturn]);
  }
  const blocks = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, values]) => values);
  const observed = mean(observations.map((o) => o.netReturn));
  if (blocks.length < 5 || observed == null) {
    return { method: 'trading-day block sign-flip permutation', iterations: 0, observed: round(observed), pValueOneTailed: null };
  }

  const rng = mulberry32(hashObservations(observations) ^ 0x5164e1f);
  let atLeastObserved = 0;
  let valid = 0;
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    let count = 0;
    for (const block of blocks) {
      const sign = rng() < 0.5 ? -1 : 1;
      for (const value of block) {
        sum += sign * value;
        count++;
      }
    }
    if (count === 0) continue;
    valid++;
    if (sum / count >= observed) atLeastObserved++;
  }
  return {
    method: 'trading-day block sign-flip permutation',
    iterations: valid,
    observed: round(observed),
    pValueOneTailed: valid ? round((atLeastObserved + 1) / (valid + 1), 6) : null,
  };
}

// ---------------------------------------------------------------------------
// Information coefficient
// ---------------------------------------------------------------------------

function rankOf(values: number[]): number[] {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j]!.value === sorted[i]!.value) j++;
    const avg = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) out[sorted[k]!.index] = avg;
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

export function spearman(x: number[], y: number[]): number | null {
  return pearson(rankOf(x), rankOf(y));
}

export interface IcResult {
  overall: number | null;
  samples: number;
  /** IC dihitung ulang di dalam tiap hari bursa lalu dirata-rata (Newey-West sederhana). */
  byPeriod: Array<{ period: string; ic: number | null; samples: number }>;
  meanOfPeriodIc: number | null;
  positivePeriodShare: number | null;
}

export function intradayInformationCoefficient(
  observations: IntradayObservation[],
  periodOf: (obs: IntradayObservation) => string,
  minSamplesPerPeriod = 20
): IcResult {
  const overall = spearman(observations.map((o) => o.score), observations.map((o) => o.netReturn));
  const grouped = new Map<string, IntradayObservation[]>();
  for (const obs of observations) {
    const key = periodOf(obs);
    const list = grouped.get(key);
    if (list) list.push(obs);
    else grouped.set(key, [obs]);
  }
  const byPeriod = Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, rows]) => rows.length >= minSamplesPerPeriod)
    .map(([period, rows]) => ({
      period,
      ic: round(spearman(rows.map((r) => r.score), rows.map((r) => r.netReturn)), 4),
      samples: rows.length,
    }));
  const ics = byPeriod.map((p) => p.ic).filter((v): v is number => v != null);
  return {
    overall: round(overall, 4),
    samples: observations.length,
    byPeriod,
    meanOfPeriodIc: round(mean(ics), 4),
    positivePeriodShare: ics.length ? round(ics.filter((v) => v > 0).length / ics.length, 4) : null,
  };
}

// ---------------------------------------------------------------------------
// Monotonicity
// ---------------------------------------------------------------------------

export interface MonotonicityResult {
  method: 'Spearman antara indeks bucket dan rata-rata net return';
  bucketsCompared: number;
  rho: number | null;
  monotonic: boolean;
}

export function bucketMonotonicity(
  buckets: Array<{ key: string; avgNetReturn: number | null }>
): MonotonicityResult {
  const usable = buckets.filter((b) => b.avgNetReturn != null);
  const rho =
    usable.length >= 3
      ? spearman(usable.map((_, i) => i), usable.map((b) => b.avgNetReturn as number))
      : null;
  return {
    method: 'Spearman antara indeks bucket dan rata-rata net return',
    bucketsCompared: usable.length,
    rho: round(rho, 4),
    monotonic: rho != null && rho > 0.5,
  };
}

// ---------------------------------------------------------------------------
// Walk-forward dengan purging & embargo
// ---------------------------------------------------------------------------

export interface WalkForwardFold {
  fold: number;
  trainStart: string;
  trainEnd: string;
  testStart: string;
  testEnd: string;
  trainSamples: number;
  testSamples: number;
  testAvgNetReturn: number | null;
  testWinRate: number | null;
  purgedDays: number;
}

export interface WalkForwardResult {
  folds: WalkForwardFold[];
  positiveFolds: number;
  totalFolds: number;
  majorityPositive: boolean;
  embargoDays: number;
  note: string;
}

/**
 * Horizon terpanjang LensIntraday adalah EOD hari yang sama, jadi label satu hari
 * TIDAK pernah tumpang tindih dengan hari berikutnya. Embargo 1 hari bursa tetap
 * dipasang sebagai jarak pengaman terhadap efek carry-over semalam, dan hari yang
 * kena embargo DIBUANG dari train, bukan dipindah ke test.
 */
export function purgedWalkForward(
  observations: IntradayObservation[],
  options: { folds?: number; embargoDays?: number } = {}
): WalkForwardResult {
  const foldCount = options.folds ?? 4;
  const embargoDays = options.embargoDays ?? 1;
  const days = Array.from(new Set(observations.map((o) => o.tradingDate))).sort();

  if (days.length < foldCount * 2) {
    return {
      folds: [],
      positiveFolds: 0,
      totalFolds: 0,
      majorityPositive: false,
      embargoDays,
      note: `Butuh minimal ${foldCount * 2} hari bursa untuk ${foldCount} fold; tersedia ${days.length}.`,
    };
  }

  const foldSize = Math.floor(days.length / (foldCount + 1));
  const folds: WalkForwardFold[] = [];
  for (let f = 0; f < foldCount; f++) {
    const trainEndIndex = foldSize * (f + 1);
    const testStartIndex = trainEndIndex + embargoDays;
    const testEndIndex = Math.min(days.length, testStartIndex + foldSize);
    if (testStartIndex >= testEndIndex) continue;

    const trainDays = new Set(days.slice(0, trainEndIndex));
    const testDays = new Set(days.slice(testStartIndex, testEndIndex));
    const trainRows = observations.filter((o) => trainDays.has(o.tradingDate));
    const testRows = observations.filter((o) => testDays.has(o.tradingDate));
    const testNets = testRows.map((r) => r.netReturn);

    folds.push({
      fold: f + 1,
      trainStart: days[0]!,
      trainEnd: days[trainEndIndex - 1]!,
      testStart: days[testStartIndex]!,
      testEnd: days[testEndIndex - 1]!,
      trainSamples: trainRows.length,
      testSamples: testRows.length,
      testAvgNetReturn: round(mean(testNets)),
      testWinRate: testNets.length ? round(testNets.filter((r) => r > 0).length / testNets.length, 4) : null,
      purgedDays: embargoDays,
    });
  }

  const positiveFolds = folds.filter((f) => (f.testAvgNetReturn ?? 0) > 0).length;
  return {
    folds,
    positiveFolds,
    totalFolds: folds.length,
    majorityPositive: folds.length > 0 && positiveFolds > folds.length / 2,
    embargoDays,
    note: 'Fold berurutan waktu (bukan acak), dengan embargo hari bursa di batas train/test.',
  };
}

// ---------------------------------------------------------------------------
// Koreksi multiple testing
// ---------------------------------------------------------------------------

export interface CorrectedPValue {
  label: string;
  pValue: number | null;
  holm: number | null;
  benjaminiHochberg: number | null;
  significantAfterCorrection: boolean;
}

/**
 * Holm (kontrol FWER) DAN Benjamini-Hochberg (kontrol FDR) dilaporkan berdampingan.
 * Panel ini menguji banyak horizon x banyak bucket x banyak irisan waktu sekaligus;
 * tanpa koreksi, satu dari dua puluh uji akan "signifikan" hanya karena banyaknya uji.
 */
export function correctPValues(
  tests: Array<{ label: string; pValue: number | null }>,
  alpha = 0.05
): CorrectedPValue[] {
  const valid = tests.filter((t) => t.pValue != null) as Array<{ label: string; pValue: number }>;
  const m = valid.length;
  if (m === 0) {
    return tests.map((t) => ({ label: t.label, pValue: null, holm: null, benjaminiHochberg: null, significantAfterCorrection: false }));
  }

  const ordered = [...valid].sort((a, b) => a.pValue - b.pValue);

  const holmByLabel = new Map<string, number>();
  let holmRunningMax = 0;
  ordered.forEach((test, i) => {
    const adjusted = Math.min(1, (m - i) * test.pValue);
    holmRunningMax = Math.max(holmRunningMax, adjusted);
    holmByLabel.set(test.label, holmRunningMax);
  });

  const bhByLabel = new Map<string, number>();
  let bhRunningMin = 1;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const adjusted = Math.min(1, (m / (i + 1)) * ordered[i]!.pValue);
    bhRunningMin = Math.min(bhRunningMin, adjusted);
    bhByLabel.set(ordered[i]!.label, bhRunningMin);
  }

  return tests.map((test) => {
    const holm = test.pValue == null ? null : round(holmByLabel.get(test.label) ?? null, 6);
    const bh = test.pValue == null ? null : round(bhByLabel.get(test.label) ?? null, 6);
    return {
      label: test.label,
      pValue: round(test.pValue, 6),
      holm,
      benjaminiHochberg: bh,
      significantAfterCorrection: holm != null && holm < alpha,
    };
  });
}

// ---------------------------------------------------------------------------
// Konsentrasi
// ---------------------------------------------------------------------------

export interface ConcentrationRow {
  key: string;
  samples: number;
  totalNetReturn: number;
  shareOfGrossProfit: number | null;
  shareOfGrossLoss: number | null;
}

export interface ConcentrationResult {
  rows: ConcentrationRow[];
  topWinners: ConcentrationRow[];
  topLosers: ConcentrationRow[];
  /** Porsi |P&L| dari 5 kunci terbesar. Di atas ~0,5 hasil bergantung pada segelintir. */
  top5AbsShare: number | null;
  concentrated: boolean;
}

export function concentrationBy(
  observations: IntradayObservation[],
  keyOf: (obs: IntradayObservation) => string
): ConcentrationResult {
  const grouped = new Map<string, IntradayObservation[]>();
  for (const obs of observations) {
    const key = keyOf(obs);
    const list = grouped.get(key);
    if (list) list.push(obs);
    else grouped.set(key, [obs]);
  }

  const grossProfit = observations.filter((o) => o.netReturn > 0).reduce((a, b) => a + b.netReturn, 0);
  const grossLoss = Math.abs(observations.filter((o) => o.netReturn <= 0).reduce((a, b) => a + b.netReturn, 0));

  const rows: ConcentrationRow[] = Array.from(grouped.entries()).map(([key, rowsForKey]) => {
    const profit = rowsForKey.filter((o) => o.netReturn > 0).reduce((a, b) => a + b.netReturn, 0);
    const loss = Math.abs(rowsForKey.filter((o) => o.netReturn <= 0).reduce((a, b) => a + b.netReturn, 0));
    return {
      key,
      samples: rowsForKey.length,
      totalNetReturn: round(rowsForKey.reduce((a, b) => a + b.netReturn, 0))!,
      shareOfGrossProfit: grossProfit > 0 ? round(profit / grossProfit, 4) : null,
      shareOfGrossLoss: grossLoss > 0 ? round(loss / grossLoss, 4) : null,
    };
  });

  const byAbs = [...rows].sort((a, b) => Math.abs(b.totalNetReturn) - Math.abs(a.totalNetReturn));
  const totalAbs = rows.reduce((a, b) => a + Math.abs(b.totalNetReturn), 0);
  const top5Abs = byAbs.slice(0, 5).reduce((a, b) => a + Math.abs(b.totalNetReturn), 0);
  const top5AbsShare = totalAbs > 0 ? round(top5Abs / totalAbs, 4) : null;

  const byNet = [...rows].sort((a, b) => b.totalNetReturn - a.totalNetReturn);
  return {
    rows: byNet,
    topWinners: byNet.slice(0, 5),
    topLosers: byNet.slice(-5).reverse(),
    top5AbsShare,
    concentrated: top5AbsShare != null && top5AbsShare > 0.5,
  };
}
