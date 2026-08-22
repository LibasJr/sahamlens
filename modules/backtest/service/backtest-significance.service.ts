import type { TradeRecord } from '../types/backtest.types';

/**
 * UJI SIGNIFIKANSI STATISTIK UNTUK SATU RUN BACKTEST (2026-08-22).
 *
 * Sebelum ini `modules/backtest` melaporkan returnPct/winRate/alpha sebagai angka titik
 * tunggal - tidak ada cara bagi user membedakan "strategi ini punya edge" dari "kebetulan
 * 8 trade beruntun". Modul lain di app ini (LensRadar, TP/CL Lab, Calibration) sudah lama
 * menjawab pertanyaan ini lewat block bootstrap + permutation test
 * (lihat modules/lens-radar/service/robust-validation.service.ts); file ini menerapkan
 * pola statistik yang SAMA ke daftar trade backtest, bukan formula baru.
 *
 * BUKAN reuse langsung dari robust-validation.service.ts: fungsi di sana dibangun atas
 * konsep "spread skor bucket 80-100 vs <60" milik LensRadar. Backtest tidak punya bucket -
 * yang ada cuma satu daftar trade dari satu strategi. Jadi mesin resampling-nya (RNG
 * deterministik, pengelompokan per-minggu kalender) ditulis ulang secara mandiri di sini,
 * mengikuti pola yang sudah ada 4 kali di codebase ini (robust-validation.service.ts,
 * tpcl-validation.service.ts, intraday-stats.ts, intraday-research.service.ts) - bukan
 * diekstrak ke modul bersama, supaya perubahan ini tetap terisolasi di modul backtest
 * dan tidak menyentuh kode lain yang sudah diuji.
 *
 * DUA UJI YANG DIJALANKAN, KEDUANYA BLOCK BY CALENDAR WEEK:
 *
 * 1. Block bootstrap CI95 atas rata-rata pnlPct. Resample BLOK minggu (bukan trade
 *    individual) dengan pengembalian - trade dalam minggu yang sama sering berbagi sinyal
 *    pasar yang sama (mis. breakout massal saat market rally), jadi memperlakukannya
 *    independen akan membuat CI terlalu sempit secara palsu (pseudo-replication - alasan
 *    yang sama dipakai groupByCalendarWeek di robust-validation.service.ts).
 *
 * 2. Block sign-flip permutation test, H0: strategi tidak punya edge (tiap trade sama
 *    mungkinnya untung/rugi). Flip tanda SELURUH blok minggu sekaligus (bukan per-trade,
 *    alasan korelasi sama seperti di atas), lalu p-value satu-arah = proporsi permutasi
 *    yang mean-nya >= mean observasi.
 *
 * YANG TIDAK DIJAWAB uji ini (lihat `note` di hasil): ini in-sample, per-run - satu
 * preset, satu periode yang user pilih sendiri. Ini BUKAN validasi out-of-sample genuine
 * seperti walk-forward-validation.service.ts milik LensRadar (yang membekukan tanggal
 * freeze dan mengukur performa forward). Uji ini menjawab "apakah rata-rata trade pada
 * histori yang diuji beda dari nol secara statistik", bukan "apakah strategi ini akan
 * bekerja ke depan".
 */

// Sama dengan gerbang sampel minimum yang dipakai 3 lapisan validasi lain di app ini
// (MIN_EFFECTIVE_T_TEST_SAMPLES di calibration.service.ts, MIN_METRIC_SAMPLES di
// tpcl-validation.service.ts, MIN_OOS_BUCKET_SAMPLE di lens-score-optimizer.service.ts).
// Di bawah 30, CI/p-value dari sampel sekecil itu didominasi kebetulan - sengaja tidak
// dihitung, bukan dihitung lalu diberi peringatan kecil yang mudah diabaikan.
export const MIN_SIGNIFICANCE_TRADES = 30;

const BOOTSTRAP_ITERATIONS = 2000;
const PERMUTATION_ITERATIONS = 2000;

export type SignificanceStatus = 'INSUFFICIENT_DATA' | 'SUPPORTIVE' | 'NEGATIVE' | 'INCONCLUSIVE';

export interface BacktestSignificanceResult {
  method: string;
  totalTrades: number;
  weekBlocks: number;
  meanPnlPct: number | null;
  bootstrap: {
    iterations: number;
    ci95Low: number | null;
    ci95High: number | null;
    status: SignificanceStatus;
  };
  permutation: {
    iterations: number;
    pValueOneTailed: number | null;
    significant: boolean;
  };
  note: string;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

function round(value: number | null, digits = 2): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentile(sortedValues: number[], p: number): number | null {
  if (!sortedValues.length) return null;
  const idx = (sortedValues.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo]!;
  const weight = idx - lo;
  return sortedValues[lo]! * (1 - weight) + sortedValues[hi]! * weight;
}

// Deterministik dari isi trade itu sendiri: input yang sama selalu menghasilkan CI/p-value
// yang sama (reproducible), bukan berubah tiap kali halaman di-refresh. Pola & konstanta
// sama dengan mulberry32 di robust-validation.service.ts/tpcl-validation.service.ts.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function nextRandom() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(trades: TradeRecord[]): number {
  let h = 0x811c9dc5;
  for (const trade of trades) {
    const s = `${trade.entryDate}|${trade.symbol}|${trade.pnlPct}`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return h >>> 0;
}

// ISO calendar week (Senin-Minggu) dari tanggal entry - definisi & implementasi identik
// dengan calendarWeekKey di robust-validation.service.ts, ditulis ulang mandiri (lihat
// catatan file di atas soal kenapa tidak diekstrak ke modul bersama).
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

function groupByEntryWeek(trades: TradeRecord[]): TradeRecord[][] {
  const map = new Map<string, TradeRecord[]>();
  for (const trade of trades) {
    if (!Number.isFinite(trade.pnlPct)) continue;
    const key = calendarWeekKey(trade.entryDate);
    const bucket = map.get(key) ?? [];
    bucket.push(trade);
    map.set(key, bucket);
  }
  return Array.from(map.values());
}

function insufficientData(totalTrades: number, weekBlocks: number, note: string): BacktestSignificanceResult {
  return {
    method: 'calendar-week block bootstrap + block sign-flip permutation',
    totalTrades,
    weekBlocks,
    meanPnlPct: null,
    bootstrap: { iterations: 0, ci95Low: null, ci95High: null, status: 'INSUFFICIENT_DATA' },
    permutation: { iterations: 0, pValueOneTailed: null, significant: false },
    note,
  };
}

export function calculateBacktestSignificance(trades: TradeRecord[]): BacktestSignificanceResult {
  const blocks = groupByEntryWeek(trades);
  const allReturns = blocks.flatMap((block) => block.map((t) => t.pnlPct));
  const observedMean = mean(allReturns);

  if (trades.length < MIN_SIGNIFICANCE_TRADES || observedMean == null) {
    return insufficientData(
      trades.length,
      blocks.length,
      `Butuh >= ${MIN_SIGNIFICANCE_TRADES} trade untuk uji signifikansi statistik; tersedia ${trades.length}. Di bawah itu CI dan p-value dari sampel sekecil itu didominasi kebetulan, sengaja tidak dihitung.`,
    );
  }

  if (blocks.length < 2) {
    return insufficientData(
      trades.length,
      blocks.length,
      'Seluruh trade jatuh di satu minggu kalender yang sama - block bootstrap/permutation butuh minimal 2 blok independen untuk resampling yang berarti.',
    );
  }

  const seed = hashSeed(trades);

  const bootRng = mulberry32((seed ^ 0x0b0057a9) >>> 0);
  const bootMeans: number[] = [];
  for (let i = 0; i < BOOTSTRAP_ITERATIONS; i++) {
    const draw: number[] = [];
    for (let j = 0; j < blocks.length; j++) {
      const block = blocks[Math.floor(bootRng() * blocks.length)]!;
      for (const trade of block) draw.push(trade.pnlPct);
    }
    const drawMean = mean(draw);
    if (drawMean != null) bootMeans.push(drawMean);
  }
  bootMeans.sort((a, b) => a - b);
  const ci95Low = percentile(bootMeans, 0.025);
  const ci95High = percentile(bootMeans, 0.975);
  const bootstrapStatus: SignificanceStatus =
    ci95Low == null || ci95High == null
      ? 'INSUFFICIENT_DATA'
      : ci95Low > 0
        ? 'SUPPORTIVE'
        : ci95High < 0
          ? 'NEGATIVE'
          : 'INCONCLUSIVE';

  const permRng = mulberry32((seed ^ 0x00c0ffee) >>> 0);
  let atLeastObserved = 0;
  for (let i = 0; i < PERMUTATION_ITERATIONS; i++) {
    const draw: number[] = [];
    for (const block of blocks) {
      const flip = permRng() < 0.5 ? -1 : 1;
      for (const trade of block) draw.push(trade.pnlPct * flip);
    }
    const drawMean = mean(draw);
    if (drawMean != null && drawMean >= observedMean) atLeastObserved++;
  }
  // +1/+1 (Laplace smoothing) supaya p-value tidak pernah persis 0 walau observasi asli
  // lebih ekstrem dari seluruh permutasi - pola sama dengan dateBlockPermutationSpread di
  // robust-validation.service.ts.
  const pValue = (atLeastObserved + 1) / (PERMUTATION_ITERATIONS + 1);

  return {
    method: 'calendar-week block bootstrap + block sign-flip permutation',
    totalTrades: trades.length,
    weekBlocks: blocks.length,
    meanPnlPct: round(observedMean, 3),
    bootstrap: {
      iterations: bootMeans.length,
      ci95Low: round(ci95Low, 3),
      ci95High: round(ci95High, 3),
      status: bootstrapStatus,
    },
    permutation: {
      iterations: PERMUTATION_ITERATIONS,
      pValueOneTailed: round(pValue, 4),
      significant: pValue < 0.05,
    },
    note: 'Uji ini in-sample dan per-run (satu preset, satu periode) - BUKAN validasi out-of-sample genuine seperti LensRadar. Menjawab "apakah rata-rata trade pada histori yang diuji beda dari nol secara statistik", bukan "apakah strategi ini akan bekerja ke depan".',
  };
}
