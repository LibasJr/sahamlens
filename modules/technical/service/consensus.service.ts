/**
 * SahamLens Consensus Engine
 *
 * Menggabungkan vote analyzer teknikal menjadi satu pembacaan konsensus.
 *
 * REWRITE (review kuantitatif 2026-08-05, temuan P1-5 & P1-6). Dua cacat yang saling
 * memperkuat diperbaiki sekaligus:
 *
 * P1-5 - PENYEBUT BERBEDA ANTAR HALAMAN. `recommendation.service.ts` memanggil fungsi ini
 * dengan 10 analyzer; `app/api/stock/[ticker]` mem-push 2 analyzer tambahan (LensFlow &
 * Bandarmology) sehingga menjadi 12. Karena `bull_pct = bull / total`, penyebutnya
 * berbeda: 7 vote bullish = 70% (BUY) di halaman Rekomendasi tapi 58% (HOLD) di halaman
 * Detail Saham - untuk saham dan hari yang SAMA. Menyatukan fungsinya (perbaikan M-04
 * dulu) tidak cukup, karena yang berbeda adalah daftar masukannya.
 *
 * P1-6 - BOBOT TREN TERSEMBUNYI. Dari 10 analyzer, EMPAT mengukur hal yang praktis sama:
 * EMA 20/50 Cross, MA Trend IDX (20,50,200), SMA Score (5,10,20), dan MACD - semuanya
 * turunan rata-rata bergerak harga penutupan. Dengan skema "1 analyzer = 1 vote setara",
 * tren menguasai ~40% suara sementara RSI hanya 10%. Bobot itu tidak pernah
 * dideklarasikan di mana pun; ia muncul sebagai efek samping dari berapa banyak analyzer
 * bertema tren yang kebetulan ditulis.
 *
 * PERBAIKANNYA SATU: vote tidak lagi dihitung per-analyzer, melainkan per-DIMENSI.
 * Setiap analyzer dipetakan ke satu dimensi, arah dimensi ditentukan dari mayoritas
 * analyzer di dalamnya, lalu dimensi-dimensi itulah yang dijumlahkan dengan bobot
 * eksplisit yang tertulis di bawah.
 *
 * Akibatnya:
 * - Menambah analyzer ke sebuah dimensi TIDAK lagi menggeser konsensus (P1-5 tertutup:
 *   LensFlow & Bandarmology masuk dimensi FLOW yang bobotnya sudah tetap).
 * - Tren tidak lagi mendapat 40% suara diam-diam (P1-6 tertutup: bobotnya tertulis, dan
 *   keempat analyzer tren berbagi satu jatah).
 * - Dimensi yang seluruh analyzer-nya tidak punya data DIKELUARKAN dan bobotnya
 *   dinormalisasi ulang - konsisten dengan aturan yang sama di scoring.service.ts.
 *
 * Skor asli tiap analyzer TIDAK diubah - halaman tetap menampilkan kartu per-analyzer
 * apa adanya. Yang berubah hanya cara menjumlahkannya.
 */

import { CONSENSUS_VOTE_THRESHOLDS } from './decision-thresholds';

interface AnalyzerVote {
  label: string;
  decision: string;      // 'BULLISH' | 'BEARISH' | 'NEUTRAL'
  confidence: number;    // 0-100
}

export type ConsensusDimension = 'TREND' | 'MOMENTUM' | 'FLOW' | 'STRUCTURE' | 'VOLATILITY';

export interface DimensionBreakdown {
  dimension: ConsensusDimension;
  weight: number;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  /** Jumlah analyzer di dimensi ini yang MEMBERI arah. 0 = dimensi dikeluarkan. */
  votedAnalyzers: number;
  analyzers: string[];
}

interface ConsensusResult {
  konsensus: string;            // mis. "STRONG BUY (80%)"
  vote: string;                 // mis. "8:2"
  /** Median confidence dari analyzer yang MEMBERI ARAH saja (bullish/bearish) - analyzer
   * netral & yang tidak punya data dikeluarkan, lihat catatan temuan M-16. 0 = tidak ada
   * satu pun analyzer yang memberi arah. */
  median_skor: number;
  bull_count: number;
  bear_count: number;
  neutral_count: number;
  total_models: number;
  /** Persentase BOBOT DIMENSI yang bullish (bukan persentase jumlah analyzer) - inilah
   * yang membuat hasilnya tidak berubah saat jumlah analyzer per dimensi berubah. */
  bull_pct: number;
  bear_pct: number;
  kategori: 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL';
  /** Rincian per dimensi - ditampilkan supaya pengguna bisa melihat bobot yang
   * sebenarnya dipakai, bukan menebaknya dari jumlah kartu analyzer. */
  dimensions: DimensionBreakdown[];
}

/**
 * Bobot dimensi. Dijumlahkan menjadi 100.
 *
 * [HIPOTESIS] Angka-angka ini BELUM divalidasi terhadap forward return - sama seperti
 * seluruh bobot lain di aplikasi ini. Bedanya: sekarang bobotnya TERTULIS dan bisa
 * diperdebatkan, bukan muncul diam-diam dari jumlah analyzer yang kebetulan ada.
 *
 * Dasar pemilihan awal: tren & momentum adalah dimensi dengan bukti empiris lintas pasar
 * paling kuat; arus dana di sini adalah PROXY dari harga+volume (bukan data broker),
 * jadi tidak pantas mendapat bobot sebesar dimensi yang diukur langsung; volatilitas
 * bukan penunjuk arah sama sekali sehingga bobotnya paling kecil - ia dilaporkan
 * terutama sebagai konteks risiko.
 */
export const CONSENSUS_DIMENSION_WEIGHTS: Record<ConsensusDimension, number> = {
  TREND: 35,
  MOMENTUM: 25,
  FLOW: 20,
  STRUCTURE: 15,
  VOLATILITY: 5,
};

/** Petakan label analyzer ke dimensinya. Pencocokan memakai potongan kata supaya tahan
 * terhadap perubahan format label (mis. 'MACD' -> 'MACD (12,26,9)').
 *
 * Analyzer yang labelnya tidak dikenali masuk 'STRUCTURE' - bukan dibuang. Membuang vote
 * secara diam-diam akan mengulang persis kelas bug yang sedang ditutup di sini. */
export function dimensionOf(label: string): ConsensusDimension {
  const l = (label || '').toLowerCase();

  // TREND - seluruh turunan rata-rata bergerak harga penutupan (inti temuan P1-6).
  if (l.includes('ema') || l.includes('macd') || l.includes('sma') ||
      l.includes('moving average') || l.includes('ma trend')) return 'TREND';

  if (l.includes('rsi') || l.includes('momentum')) return 'MOMENTUM';

  if (l.includes('volume') || l.includes('flow') || l.includes('bandarmology') ||
      l.includes('cmf')) return 'FLOW';

  if (l.includes('volatil') || l.includes('atr')) return 'VOLATILITY';

  return 'STRUCTURE';  // support & resistance, pola, dan label yang belum dikenali
}

function getMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

const EMPTY: ConsensusResult = {
  konsensus: 'AWAITING',
  vote: '0:0',
  median_skor: 0,
  bull_count: 0,
  bear_count: 0,
  neutral_count: 0,
  total_models: 0,
  bull_pct: 0,
  bear_pct: 0,
  kategori: 'HOLD',
  dimensions: [],
};

export function calculateConsensus(analyzers: AnalyzerVote[]): ConsensusResult {
  if (!analyzers || analyzers.length === 0) return { ...EMPTY };

  let bullCount = 0;
  let bearCount = 0;
  let neutralCount = 0;
  const directionalConfidences: number[] = [];

  // Kelompokkan per dimensi.
  const buckets = new Map<ConsensusDimension, { bull: number; bear: number; labels: string[] }>();

  for (const a of analyzers) {
    const dim = dimensionOf(a.label);
    if (!buckets.has(dim)) buckets.set(dim, { bull: 0, bear: 0, labels: [] });
    const b = buckets.get(dim)!;
    b.labels.push(a.label);

    if (a.decision === 'BULLISH') { bullCount++; b.bull++; directionalConfidences.push(a.confidence); }
    else if (a.decision === 'BEARISH') { bearCount++; b.bear++; directionalConfidences.push(a.confidence); }
    else neutralCount++;
  }

  // Arah tiap dimensi = mayoritas analyzer BERARAH di dalamnya. Seri = NEUTRAL:
  // dimensi yang analyzer-nya saling bertentangan tidak boleh dipaksa memihak.
  const dimensions: DimensionBreakdown[] = [];
  let bullWeight = 0;
  let bearWeight = 0;
  let activeWeight = 0;

  for (const dimension of Array.from(buckets.keys())) {
    const b = buckets.get(dimension)!;
    const weight = CONSENSUS_DIMENSION_WEIGHTS[dimension];
    const voted = b.bull + b.bear;
    let direction: DimensionBreakdown['direction'] = 'NEUTRAL';
    if (voted > 0) {
      // Dimensi yang punya minimal satu analyzer berarah IKUT sebagai penyebut -
      // termasuk saat arahnya seri (NEUTRAL), karena "dimensi ini tidak sepakat"
      // adalah informasi, bukan ketiadaan data.
      activeWeight += weight;
      if (b.bull > b.bear) { direction = 'BULLISH'; bullWeight += weight; }
      else if (b.bear > b.bull) { direction = 'BEARISH'; bearWeight += weight; }
    }
    dimensions.push({ dimension, weight, direction, votedAnalyzers: voted, analyzers: b.labels });
  }

  // Renormalisasi ke bobot dimensi yang BENAR-BENAR punya arah - dimensi tanpa data
  // tidak menyeret konsensus ke tengah (aturan yang sama dengan scoring.service.ts).
  const bullPct = activeWeight > 0 ? Math.round((bullWeight / activeWeight) * 100) : 0;
  const bearPct = activeWeight > 0 ? Math.round((bearWeight / activeWeight) * 100) : 0;

  let kategori: ConsensusResult['kategori'];
  let konsensusLabel: string;

  if (bullPct >= CONSENSUS_VOTE_THRESHOLDS.STRONG) {
    kategori = 'STRONG BUY';
    konsensusLabel = `STRONG BUY (${bullPct}%)`;
  } else if (bullPct >= CONSENSUS_VOTE_THRESHOLDS.NORMAL) {
    kategori = 'BUY';
    konsensusLabel = `BUY (${bullPct}%)`;
  } else if (bearPct >= CONSENSUS_VOTE_THRESHOLDS.STRONG) {
    kategori = 'STRONG SELL';
    konsensusLabel = `STRONG SELL (${bearPct}%)`;
  } else if (bearPct >= CONSENSUS_VOTE_THRESHOLDS.NORMAL) {
    kategori = 'SELL';
    konsensusLabel = `SELL (${bearPct}%)`;
  } else {
    kategori = 'HOLD';
    konsensusLabel = `HOLD (Bull ${bullPct}% : Bear ${bearPct}%)`;
  }

  return {
    konsensus: konsensusLabel,
    vote: `${bullCount}:${bearCount}`,
    median_skor: getMedian(directionalConfidences),
    bull_count: bullCount,
    bear_count: bearCount,
    neutral_count: neutralCount,
    total_models: analyzers.length,
    bull_pct: bullPct,
    bear_pct: bearPct,
    kategori,
    dimensions: dimensions.sort((a, b) => b.weight - a.weight),
  };
}
