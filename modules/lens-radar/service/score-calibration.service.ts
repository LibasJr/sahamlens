import { MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION } from '../constants/research-status';

/**
 * KALIBRASI (temuan C-4 audit kuantitatif 2026-08-11).
 *
 * Sampai audit itu, modul bernama "Calibration Lab" hanya mengukur DISCRIMINATION -
 * apakah skor tinggi memisahkan diri dari skor rendah. Discrimination dan calibration
 * adalah dua pertanyaan yang berbeda, dan yang kedua tidak pernah ditanyakan:
 *
 *   discrimination: apakah skor 85 berakhir lebih baik daripada skor 55?
 *   calibration   : kalau skor 85 dibaca sebagai "85% peluang menang", apakah 85% dari
 *                   sinyal skor 85 benar-benar menang?
 *
 * Model bisa sempurna pada yang pertama dan kacau pada yang kedua secara bersamaan.
 *
 * SATU CATATAN YANG MENENTUKAN CARA MEMBACA SELURUH FILE INI: LensScore BUKAN
 * probabilitas, dan SahamLens tidak pernah mengklaim demikian. Tidak ada satu tempat pun
 * di produk yang menerjemahkan LensScore 76 menjadi "76% peluang untung". Karena itu
 * pemetaan naif p = skor/100 di bawah ini adalah TITIK ACUAN, bukan klaim produk yang
 * sedang diuji. ECE yang besar terhadap pemetaan naif bukan bug - itu hasil yang
 * diharapkan, dan justru itulah alasan angka skor tidak boleh dibaca sebagai persen.
 * Yang benar-benar informatif adalah bagian isotonic: ia menjawab apakah ADA pemetaan
 * monoton dari skor ke probabilitas yang bertahan di luar sampel latihnya.
 */

export const CALIBRATION_PROTOCOL_VERSION = 'cal-v1.0' as const;

/**
 * Definisi outcome biner. Ditulis sebelum melihat data dan sengaja diletakkan sebagai
 * konstanta yang diekspor: kalau aturannya diubah setelah melihat hasil, diff-nya
 * kelihatan di review. Memakai return BERSIH (biaya round-trip sudah dikurangkan di
 * buildCalibrationObservations) karena "menang" harus berarti menang setelah ongkos.
 */
export const CALIBRATION_OUTCOME_RULE =
  'y = 1 jika return T+20 bersih (setelah biaya round-trip) > 0; y = 0 jika <= 0' as const;

/** Lebar bin skor, dalam poin LensScore. 10 poin = 10 bin, konvensi reliability diagram. */
export const CALIBRATION_BIN_WIDTH = 10;

/**
 * Sebuah bin baru boleh dibaca sebagai bukti pada jumlah ini. Sengaja memakai konstanta
 * yang sama dengan gerbang validasi lain supaya "cukup sampel" berarti satu hal saja di
 * seluruh produk, bukan tiga angka berbeda di tiga file.
 */
export const MIN_SAMPLES_PER_RELIABLE_BIN = MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION;

/** Isotonic butuh dua sisi split terisi; di bawah ini fit-nya tidak dijalankan sama sekali. */
export const MIN_SAMPLES_PER_ISOTONIC_SPLIT = MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION;

/** Porsi sampel paling awal yang dipakai melatih isotonic. Split-nya temporal, bukan acak. */
export const ISOTONIC_TRAIN_FRACTION = 0.7;

export interface CalibrationSampleInput {
  ticker: string;
  signalDate: string;
  lensScore: number;
  returnT20: number | null;
}

export interface CalibrationPair {
  /** Probabilitas yang diprediksi, 0..1. */
  p: number;
  /** Outcome biner, 0 atau 1. */
  y: 0 | 1;
  score: number;
  signalDate: string;
}

export interface ReliabilityBin {
  binLow: number;
  binHigh: number;
  samples: number;
  wins: number;
  meanScore: number;
  /** Rata-rata probabilitas yang diprediksi di bin ini. */
  predicted: number;
  /** Frekuensi menang yang benar-benar teramati. */
  observed: number;
  wilsonLow: number;
  wilsonHigh: number;
  /** n >= MIN_SAMPLES_PER_RELIABLE_BIN. Bin tak reliabel tetap ditampilkan, tidak dibuang. */
  reliable: boolean;
  /** Apakah prediksi jatuh di dalam CI 95% observasi. Kalau tidak, bin ini salah kalibrasi. */
  predictionWithinCi: boolean;
}

export interface CalibrationMetrics {
  samples: number;
  /** Frekuensi menang keseluruhan - prediksi konstan terbaik tanpa model. */
  baseRate: number;
  /** Expected Calibration Error: rata-rata |observed - predicted| berbobot ukuran bin. */
  ece: number;
  /** Brier score, (1/N) sum (p - y)^2. Makin kecil makin baik. */
  brier: number;
  /** Brier dari prediksi konstan = base rate. Ini pembanding yang benar, bukan 0. */
  brierBaseRate: number;
  /**
   * 1 - brier/brierBaseRate. Positif berarti pemetaan mengalahkan tebakan konstan;
   * NEGATIF berarti lebih buruk daripada tidak memakai skor sama sekali.
   */
  brierSkillScore: number;
}

export type CalibrationStatus =
  | 'WAITING_FOR_MATURITY'
  | 'INSUFFICIENT_SAMPLE'
  | 'REPORTED';

export interface IsotonicPoint {
  score: number;
  probability: number;
}

export interface IsotonicEvaluation {
  method: 'isotonic regression (PAVA), fit di TRAIN saja, diuji di TEST';
  fitted: boolean;
  splitDate: string | null;
  trainSamples: number;
  testSamples: number;
  /** Kurva hasil fit, dilaporkan supaya pemetaannya bisa diperiksa, bukan kotak hitam. */
  curve: IsotonicPoint[];
  /** Metrik pemetaan naif p = skor/100 DI BARIS TEST YANG SAMA. Pembanding apple-to-apple. */
  naiveOnTest: CalibrationMetrics | null;
  /** Metrik pemetaan hasil isotonic di baris test. */
  isotonicOnTest: CalibrationMetrics | null;
  /** Apakah isotonic memperbaiki Brier di TEST (bukan di train - itu selalu iya). */
  improvesBrierOutOfSample: boolean;
  note: string;
}

export interface ScoreCalibrationResult {
  protocolVersion: typeof CALIBRATION_PROTOCOL_VERSION;
  outcomeRule: typeof CALIBRATION_OUTCOME_RULE;
  status: CalibrationStatus;
  /** Sampel matang yang punya return T+20; sudah didekorelasi oleh pemanggil. */
  samples: number;
  binWidth: number;
  minSamplesPerReliableBin: number;
  reliableBins: number;
  bins: ReliabilityBin[];
  /** Metrik pemetaan naif atas SELURUH sampel. In-sample, hanya deskriptif. */
  naive: CalibrationMetrics | null;
  isotonic: IsotonicEvaluation;
  /**
   * Berapa banyak bin reliabel yang CI 95% observasinya TIDAK memuat prediksi naif.
   * Ini pernyataan yang bisa diuji: kalau mayoritas bin reliabel meleset, membaca
   * LensScore sebagai persen peluang menang tertolak oleh data.
   */
  naiveMappingRejectedBins: number;
  naiveMappingRejected: boolean;
  conclusion: string;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Wilson score interval 95%. Dipilih ketimbang interval normal biasa karena pada n kecil
 * atau p mendekati 0/1 - persis keadaan bin ujung di sini - interval normal menghasilkan
 * batas di luar [0,1] dan cakupan yang jauh dari 95%. Wilson tidak.
 */
export function wilsonInterval(successes: number, total: number, z = 1.959964): { low: number; high: number } {
  if (total <= 0) return { low: 0, high: 1 };
  const phat = successes / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const center = (phat + z2 / (2 * total)) / denom;
  const margin = (z / denom) * Math.sqrt((phat * (1 - phat)) / total + z2 / (4 * total * total));
  return {
    low: Math.max(0, round(center - margin)),
    high: Math.min(1, round(center + margin)),
  };
}

function toPairs(samples: CalibrationSampleInput[], mapper: (score: number) => number): CalibrationPair[] {
  const pairs: CalibrationPair[] = [];
  for (const sample of samples) {
    if (typeof sample.returnT20 !== 'number' || !Number.isFinite(sample.returnT20)) continue;
    if (!Number.isFinite(sample.lensScore)) continue;
    pairs.push({
      p: clamp01(mapper(sample.lensScore)),
      y: sample.returnT20 > 0 ? 1 : 0,
      score: sample.lensScore,
      signalDate: sample.signalDate,
    });
  }
  return pairs;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Pemetaan naif: skor 76 dibaca sebagai 76% peluang menang. Acuan, bukan klaim produk. */
export function naiveProbabilityFromScore(score: number): number {
  return clamp01(score / 100);
}

/**
 * Bin dibentuk atas SKOR, bukan atas probabilitas hasil pemetaan, supaya sumbu-x
 * reliability diagram tetap terbaca sebagai LensScore di UI. Untuk pemetaan naif keduanya
 * identik; untuk isotonic, bin skor tetap yang benar karena skor-lah yang dilihat pengguna.
 */
export function buildReliabilityBins(pairs: CalibrationPair[], binWidth = CALIBRATION_BIN_WIDTH): ReliabilityBin[] {
  if (!pairs.length) return [];
  const buckets = new Map<number, CalibrationPair[]>();
  for (const pair of pairs) {
    const index = Math.min(Math.floor(pair.score / binWidth), Math.floor(100 / binWidth) - 1);
    const list = buckets.get(index);
    if (list) list.push(pair);
    else buckets.set(index, [pair]);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([index, list]) => {
      const wins = list.filter((pair) => pair.y === 1).length;
      const observed = wins / list.length;
      const predicted = list.reduce((sum, pair) => sum + pair.p, 0) / list.length;
      const ci = wilsonInterval(wins, list.length);
      return {
        binLow: index * binWidth,
        binHigh: index * binWidth + binWidth,
        samples: list.length,
        wins,
        meanScore: round(list.reduce((sum, pair) => sum + pair.score, 0) / list.length, 2),
        predicted: round(predicted),
        observed: round(observed),
        wilsonLow: ci.low,
        wilsonHigh: ci.high,
        reliable: list.length >= MIN_SAMPLES_PER_RELIABLE_BIN,
        predictionWithinCi: predicted >= ci.low && predicted <= ci.high,
      };
    });
}

export function calibrationMetrics(pairs: CalibrationPair[], binWidth = CALIBRATION_BIN_WIDTH): CalibrationMetrics | null {
  if (!pairs.length) return null;
  const n = pairs.length;
  const baseRate = pairs.reduce((sum, pair) => sum + pair.y, 0) / n;
  const brier = pairs.reduce((sum, pair) => sum + (pair.p - pair.y) ** 2, 0) / n;
  const brierBaseRate = pairs.reduce((sum, pair) => sum + (baseRate - pair.y) ** 2, 0) / n;

  const bins = buildReliabilityBins(pairs, binWidth);
  const ece = bins.reduce((sum, bin) => sum + (bin.samples / n) * Math.abs(bin.observed - bin.predicted), 0);

  return {
    samples: n,
    baseRate: round(baseRate),
    ece: round(ece),
    brier: round(brier),
    brierBaseRate: round(brierBaseRate),
    // brierBaseRate = 0 hanya kalau semua outcome identik; skill score tidak terdefinisi
    // di situ dan 0 adalah jawaban yang jujur (tidak ada yang bisa diperbaiki).
    brierSkillScore: brierBaseRate > 0 ? round(1 - brier / brierBaseRate) : 0,
  };
}

/**
 * Isotonic regression lewat Pool Adjacent Violators. Menghasilkan fungsi monoton naik dari
 * skor ke probabilitas - monoton karena itulah asumsi yang memang ingin diuji: skor lebih
 * tinggi seharusnya tidak pernah berarti peluang lebih rendah.
 */
export function fitIsotonic(points: Array<{ x: number; y: number }>): IsotonicPoint[] {
  if (!points.length) return [];
  const sorted = [...points].sort((a, b) => a.x - b.x);

  // Titik dengan x sama harus digabung lebih dulu; kalau tidak, PAVA bisa menghasilkan dua
  // probabilitas berbeda untuk skor yang sama persis.
  const blocks: Array<{ x: number; sum: number; weight: number }> = [];
  for (const point of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && last.x === point.x) {
      last.sum += point.y;
      last.weight += 1;
    } else {
      blocks.push({ x: point.x, sum: point.y, weight: 1 });
    }
  }

  // PAVA: selama ada blok yang rata-ratanya turun dibanding blok sebelumnya, gabungkan.
  const pooled: Array<{ x: number; sum: number; weight: number }> = [];
  for (const block of blocks) {
    pooled.push({ ...block });
    while (
      pooled.length > 1
      && pooled[pooled.length - 2]!.sum / pooled[pooled.length - 2]!.weight
         > pooled[pooled.length - 1]!.sum / pooled[pooled.length - 1]!.weight
    ) {
      const right = pooled.pop()!;
      const left = pooled.pop()!;
      pooled.push({ x: right.x, sum: left.sum + right.sum, weight: left.weight + right.weight });
    }
  }

  return pooled.map((block) => ({
    score: block.x,
    probability: round(clamp01(block.sum / block.weight)),
  }));
}

/**
 * Menerapkan kurva isotonic. Di antara dua simpul dipakai interpolasi linier; di luar
 * rentang latih dipakai nilai ujung - ekstrapolasi pada model monoton hasil fit adalah
 * mengarang, dan menahannya di ujung adalah pilihan yang paling tidak mengklaim.
 */
export function applyIsotonic(curve: IsotonicPoint[], score: number): number {
  if (!curve.length) return 0;
  if (score <= curve[0]!.score) return curve[0]!.probability;
  const last = curve[curve.length - 1]!;
  if (score >= last.score) return last.probability;

  for (let i = 1; i < curve.length; i++) {
    const right = curve[i]!;
    if (score <= right.score) {
      const left = curve[i - 1]!;
      const span = right.score - left.score;
      if (span <= 0) return right.probability;
      const ratio = (score - left.score) / span;
      return clamp01(left.probability + ratio * (right.probability - left.probability));
    }
  }
  return last.probability;
}

/**
 * Split temporal. Batasnya digeser maju sampai tanggalnya berganti supaya tidak ada satu
 * tanggal sinyal yang badannya ada di train dan ekornya di test - kebocoran kecil itu
 * cukup untuk membuat hasil test terlihat lebih baik daripada sebenarnya.
 */
function temporalSplit(pairs: CalibrationPair[], trainFraction: number): { train: CalibrationPair[]; test: CalibrationPair[]; splitDate: string | null } {
  const sorted = [...pairs].sort((a, b) => (a.signalDate < b.signalDate ? -1 : a.signalDate > b.signalDate ? 1 : 0));
  if (sorted.length < 2) return { train: sorted, test: [], splitDate: null };

  let boundary = Math.floor(sorted.length * trainFraction);
  if (boundary < 1) boundary = 1;
  const boundaryDate = sorted[boundary - 1]!.signalDate;
  while (boundary < sorted.length && sorted[boundary]!.signalDate === boundaryDate) boundary++;

  return {
    train: sorted.slice(0, boundary),
    test: sorted.slice(boundary),
    splitDate: sorted[boundary]?.signalDate ?? null,
  };
}

function evaluateIsotonic(samples: CalibrationSampleInput[]): IsotonicEvaluation {
  const base: IsotonicEvaluation = {
    method: 'isotonic regression (PAVA), fit di TRAIN saja, diuji di TEST',
    fitted: false,
    splitDate: null,
    trainSamples: 0,
    testSamples: 0,
    curve: [],
    naiveOnTest: null,
    isotonicOnTest: null,
    improvesBrierOutOfSample: false,
    note: '',
  };

  const pairs = toPairs(samples, naiveProbabilityFromScore);
  const { train, test, splitDate } = temporalSplit(pairs, ISOTONIC_TRAIN_FRACTION);
  base.trainSamples = train.length;
  base.testSamples = test.length;
  base.splitDate = splitDate;

  if (train.length < MIN_SAMPLES_PER_ISOTONIC_SPLIT || test.length < MIN_SAMPLES_PER_ISOTONIC_SPLIT) {
    base.note = `Fit tidak dijalankan: butuh >= ${MIN_SAMPLES_PER_ISOTONIC_SPLIT} sampel di TRAIN dan di TEST, tersedia ${train.length}/${test.length}. Mem-fit isotonic pada seluruh data lalu melaporkannya sebagai bukti adalah cara paling cepat menghasilkan kalibrasi sempurna yang tidak berarti apa-apa.`;
    return base;
  }

  const curve = fitIsotonic(train.map((pair) => ({ x: pair.score, y: pair.y })));
  const isotonicTestPairs: CalibrationPair[] = test.map((pair) => ({ ...pair, p: applyIsotonic(curve, pair.score) }));

  const naiveOnTest = calibrationMetrics(test);
  const isotonicOnTest = calibrationMetrics(isotonicTestPairs);

  base.fitted = true;
  base.curve = curve;
  base.naiveOnTest = naiveOnTest;
  base.isotonicOnTest = isotonicOnTest;
  base.improvesBrierOutOfSample = naiveOnTest != null && isotonicOnTest != null
    && isotonicOnTest.brier < naiveOnTest.brier;
  base.note = isotonicOnTest == null
    ? 'Fit berjalan tetapi metrik test tidak terhitung.'
    : isotonicOnTest.brierSkillScore > 0
      ? `Kurva hasil TRAIN masih mengalahkan tebakan base rate di TEST (skill score ${isotonicOnTest.brierSkillScore}). Ini indikasi, bukan validasi: split-nya retrospektif, jadi periode TEST bukan genuine out-of-sample.`
      : `Kurva hasil TRAIN TIDAK bertahan di TEST (skill score ${isotonicOnTest.brierSkillScore} <= 0): pemetaan skor ke probabilitas tidak lebih baik daripada menebak base rate. Jangan pakai skor sebagai probabilitas.`;

  return base;
}

/**
 * Pemanggil WAJIB mengirim sampel yang sudah didekorelasi (satu ticker tidak boleh
 * menyumbang beberapa observasi T+20 yang tumpang tindih). Kalibrasi tidak mengoreksi
 * korelasi sisa; n yang digelembungkan akan mempersempit CI Wilson secara palsu.
 */
export function buildScoreCalibration(samples: CalibrationSampleInput[]): ScoreCalibrationResult {
  const pairs = toPairs(samples, naiveProbabilityFromScore);

  const shell = {
    protocolVersion: CALIBRATION_PROTOCOL_VERSION,
    outcomeRule: CALIBRATION_OUTCOME_RULE,
    samples: pairs.length,
    binWidth: CALIBRATION_BIN_WIDTH,
    minSamplesPerReliableBin: MIN_SAMPLES_PER_RELIABLE_BIN,
  };

  if (!pairs.length) {
    return {
      ...shell,
      status: 'WAITING_FOR_MATURITY',
      reliableBins: 0,
      bins: [],
      naive: null,
      isotonic: evaluateIsotonic(samples),
      naiveMappingRejectedBins: 0,
      naiveMappingRejected: false,
      conclusion: 'Belum ada observasi T+20 matang. Tidak ada kurva kalibrasi yang bisa dibentuk - halaman ini sengaja tidak menampilkan angka pengganti.',
    };
  }

  const bins = buildReliabilityBins(pairs);
  const reliableBins = bins.filter((bin) => bin.reliable);
  const rejectedBins = reliableBins.filter((bin) => !bin.predictionWithinCi);
  const naive = calibrationMetrics(pairs);
  const isotonic = evaluateIsotonic(samples);

  if (pairs.length < MIN_EFFECTIVE_SAMPLES_FOR_VALIDATION || reliableBins.length === 0) {
    return {
      ...shell,
      status: 'INSUFFICIENT_SAMPLE',
      reliableBins: reliableBins.length,
      bins,
      naive,
      isotonic,
      naiveMappingRejectedBins: rejectedBins.length,
      naiveMappingRejected: false,
      conclusion: `Sudah ada ${pairs.length} observasi matang tetapi belum ada satu pun bin dengan >= ${MIN_SAMPLES_PER_RELIABLE_BIN} sampel. Angka ECE/Brier di bawah tetap dihitung apa adanya untuk memantau progres, bukan sebagai bukti kalibrasi.`,
    };
  }

  const naiveMappingRejected = rejectedBins.length > reliableBins.length / 2;

  return {
    ...shell,
    status: 'REPORTED',
    reliableBins: reliableBins.length,
    bins,
    naive,
    isotonic,
    naiveMappingRejectedBins: rejectedBins.length,
    naiveMappingRejected,
    conclusion: [
      naiveMappingRejected
        ? `Pemetaan naif tertolak: ${rejectedBins.length} dari ${reliableBins.length} bin reliabel punya CI 95% yang tidak memuat prediksi skor/100. LensScore tidak boleh dibaca sebagai persen peluang menang - dan produk memang tidak pernah menyatakannya begitu.`
        : `Pemetaan naif belum tertolak oleh data (${rejectedBins.length} dari ${reliableBins.length} bin reliabel meleset dari CI). Ini bukan izin untuk mulai menyebut skor sebagai persen: tidak tertolak pada sampel sekecil ini berbeda jauh dari terbukti.`,
      isotonic.note,
    ].join(' '),
  };
}
