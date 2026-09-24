/**
 * Keputusan siklus hidup LensIntraday - 24 September 2026.
 *
 * MENGAPA BERKAS INI ADA. Status riset LensIntraday sebelumnya hanya bisa dibaca dari
 * hasil validasi terakhir (`VALIDATION_FAILED`, run 13 September 2026). Itu cukup untuk
 * mesin, tetapi tidak cukup untuk keputusan: selama tidak ada pernyataan yang berdiri
 * sendiri, setiap orang yang membuka lab-nya akan mengira keadaan itu SEMENTARA dan
 * menunggu 60 hari bursa berlalu. Padahal angka brutonya sudah menjawab lebih dulu.
 *
 * Yang diukur pada 24 September 2026 (`npm run dissect:intraday`, baca-saja, memakai
 * loader produksi `loadIntradayObservations`, sampel = sinyal SETELAH protokol dibekukan):
 *
 *   sampel OOS            15.112 baris / 8 hari bursa / 60 emiten
 *   bruto per transaksi   -0,00025
 *   biaya per transaksi    0,00802   (fee 0,15% beli + 0,25% jual + slippage terpasang)
 *   netto per transaksi   -0,00827
 *   win rate              11,31%     profit factor 0,113
 *   irisan netto>0 & p<0,05   0 (NOL) - di semua horizon, bucket skor, jam sinyal,
 *                              dan band likuiditas
 *   irisan bruto terbaik  EOD jam 15:00: +0,00229 (n=480, p=1,00) - MASIH di bawah biaya
 *
 * Kesimpulannya bukan "biayanya terlalu besar", melainkan "bruto-nya sendiri tidak
 * berkeunggulan": rata-rata bruto praktis nol, dan tidak ada satu irisan pun yang lolos
 * setelah biaya. Menambah hari OOS tidak mengubah sifat itu - yang bisa mengubahnya hanya
 * perubahan model, dan itu berarti freeze baru dengan hitungan OOS mulai dari nol.
 *
 * Karena itu lini intraday DITUTUP untuk promosi (tetap RESEARCH_ONLY), sementara
 * pengumpulan bar harian TETAP BERJALAN sebagai arsip supaya keputusan ini bisa diuji
 * ulang kapan saja dengan data yang lebih panjang - tanpa biaya tambahan.
 *
 * Kriteria validasi yang sudah dibekukan TIDAK disentuh oleh berkas ini, dan tidak boleh
 * disentuh: mengubah ambang supaya lolos adalah p-hacking, bukan validasi.
 */

export const INTRADAY_LIFECYCLE_DECISION_KEY = 'intraday-lensintraday-2026-09-24' as const;

export type IntradayLifecycleDecision = 'CLOSED_RESEARCH_ONLY';

export interface IntradayLifecycleEvidence {
  modelVersion: string;
  protocolVersion: string;
  frozenAt: string;
  measuredAt: string;
  oosRows: number;
  oosTradingDays: number;
  oosTickers: number;
  grossExpectancy: number;
  costPerTrade: number;
  netExpectancy: number;
  winRate: number;
  profitFactor: number;
  positiveSlicesNetWithP05: number;
  bestGrossSliceLabel: string;
  bestGrossSliceValue: number;
  dissectionScript: string;
}

export interface IntradayLifecycleDecisionRecord {
  key: string;
  decision: IntradayLifecycleDecision;
  status: 'RESEARCH_ONLY';
  decidedAt: string;
  collectionContinues: boolean;
  evidence: IntradayLifecycleEvidence;
  /** Syarat yang HARUS terpenuhi sebelum lini ini boleh dipertimbangkan lagi. */
  reopenRequirements: readonly string[];
  rationale: string;
  nextFocus: string;
}

export const INTRADAY_LIFECYCLE_DECISION: IntradayLifecycleDecisionRecord = {
  key: INTRADAY_LIFECYCLE_DECISION_KEY,
  decision: 'CLOSED_RESEARCH_ONLY',
  status: 'RESEARCH_ONLY',
  decidedAt: '2026-09-24',
  collectionContinues: true,
  evidence: {
    modelVersion: 'lens-intraday-v0.2.0',
    protocolVersion: 'oos-lens-intraday-v0.2.0-cfg-1715aa11',
    frozenAt: '2026-09-13',
    measuredAt: '2026-09-24',
    oosRows: 15112,
    oosTradingDays: 8,
    oosTickers: 60,
    grossExpectancy: -0.00025,
    costPerTrade: 0.00802,
    netExpectancy: -0.00827,
    winRate: 0.1131,
    profitFactor: 0.113,
    positiveSlicesNetWithP05: 0,
    bestGrossSliceLabel: 'EOD jam 15:00',
    bestGrossSliceValue: 0.00229,
    dissectionScript: 'scripts/intraday-oos-dissection.mjs',
  },
  reopenRequirements: [
    'Ada konfigurasi model BARU yang dibekukan (freeze timestamp baru) - bukan protokol lama yang ditunggu.',
    'Bruto per transaksi harus melampaui biaya per transaksi 0,802% dengan selisih yang jelas, bukan setipis noise.',
    'Kriteria beku yang sama terpenuhi apa adanya: >= 60 hari bursa OOS pasca-freeze, >= 30 emiten, >= 500 sampel efektif.',
    'Minimal satu irisan OOS punya netto > 0 dengan p < 0,05 SETELAH biaya, dan irisan itu bisa dieksekusi (lolos saringan tradability).',
    'Tidak ada ambang, bobot, atau kriteria yang diubah untuk membuat syarat di atas terpenuhi.',
  ],
  rationale:
    'Rata-rata bruto per transaksi praktis nol (-0,00025) dan tidak ada satu pun irisan yang positif setelah biaya; ' +
    'kerugian bukan semata akibat biaya 0,802% per transaksi, melainkan karena sinyalnya sendiri tidak berkeunggulan. ' +
    'Menunggu 60 hari bursa hanya akan mengulang pengukuran yang sama dengan sampel lebih besar.',
  nextFocus:
    'Fokus kembali ke lini horizon harian yang sudah punya bukti terukur (LensRadar/LensScore + validasi T+20), ' +
    'dan ke pemeliharaan data yang menopangnya. Arsip intraday tetap terkumpul lewat sahamlens-intraday-collect.timer ' +
    'dan diawasi sahamlens-intraday-watchdog.timer.',
};