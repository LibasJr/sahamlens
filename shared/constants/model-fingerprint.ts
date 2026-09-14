import { sha256Hex } from '@/shared/crypto/sha256';
import { LENS_SCORE_WEIGHTS, LENS_SCORE_TOTAL_WEIGHT } from './lens-score-weights';
import { MIN_COVERAGE_PCT } from '@/modules/technical/service/scoring.service';

/**
 * Sidik jari parameter model LensScore.
 *
 * ===================================================================================
 * MASALAH YANG DIPECAHKAN
 * ===================================================================================
 * Status validasi model sebelumnya adalah konstanta:
 *
 *     const STATUS = { validated: false, ... };
 *
 * Aman selama nilainya `false`. Tapi begitu seseorang menuliskan `true`, status itu
 * tidak terikat pada apa pun: formula boleh berubah, bobot boleh digeser, ambang
 * boleh dinaikkan - dan status tetap berbunyi "validated".
 *
 * Itu bentuk paling murni dari klaim tanpa bukti: model yang divalidasi bulan lalu
 * dengan bobot 40/30/30 tidak punya hubungan apa pun dengan model yang hari ini
 * berjalan dengan bobot 50/25/25, tapi keduanya akan mengaku "tervalidasi".
 *
 * ===================================================================================
 * CARA KERJA
 * ===================================================================================
 * Setiap parameter yang MEMPENGARUHI KELUARAN model dikumpulkan ke satu objek,
 * diserialisasi secara deterministik, lalu di-hash. Artefak validasi menyimpan hash
 * itu. Saat runtime, hash dihitung ulang dari parameter yang benar-benar aktif dan
 * dibandingkan. Beda satu digit -> MODEL_UNVALIDATED.
 *
 * Tidak ada cara menyatakan "validated" tanpa artefak yang sidik jarinya cocok.
 *
 * ===================================================================================
 * APA YANG MASUK, DAN KENAPA
 * ===================================================================================
 * Yang masuk hanya hal yang mengubah ANGKA KELUARAN atau KEPUTUSAN:
 *
 *   - bobot tiga pilar     -> mengubah skor secara langsung
 *   - total bobot          -> penyebut skor akhir
 *   - ambang coverage      -> menentukan saham layak dinilai atau tidak
 *   - ambang keputusan     -> memetakan skor menjadi aksi
 *   - umur data maksimum   -> menentukan sinyal boleh dieksekusi atau tidak
 *   - versi formula        -> dinaikkan manual saat rumus komponen berubah
 *
 * Yang TIDAK masuk: teks pesan, nama variabel, format tampilan. Mengubahnya tidak
 * mengubah satu pun angka, dan memasukkannya hanya akan membuat sidik jari berubah
 * karena perbaikan salah ketik - gerbang yang memerah untuk hal sepele akan
 * dimatikan orang dalam seminggu.
 *
 * ===================================================================================
 * KENAPA VERSI FORMULA HARUS MANUAL
 * ===================================================================================
 * Bobot dan ambang adalah angka - bisa dibaca dan di-hash otomatis. Rumus komponen
 * (bagaimana RSI dipetakan ke skor, bagaimana MACD dinilai) adalah KODE, dan kode
 * tidak bisa di-hash dengan andal tanpa ikut menangkap komentar, spasi, dan
 * refactor yang tidak mengubah perilaku.
 *
 * Jadi `SCORE_FORMULA_VERSION` dinaikkan manual. Itu titik lemah yang jujur, dan
 * ditandai di sini supaya tidak ada yang mengira otomatisasi ini lebih pintar
 * daripada yang sebenarnya. Penjagaan tambahannya ada di test: berkas scoring
 * punya gerbang yang mengingatkan saat rumusnya berubah.
 */

/**
 * Versi rumus komponen LensScore. WAJIB dinaikkan setiap kali cara sebuah komponen
 * dihitung berubah - bukan saat teks/komentar berubah.
 */
export const SCORE_FORMULA_VERSION = 'lens-score-formula-v1.0';

/** Versi skema artefak validasi itu sendiri. */
export const VALIDATION_ARTIFACT_SCHEMA_VERSION = 'validation-artifact-v1';

/**
 * Ambang yang memetakan skor menjadi keputusan.
 *
 * Nilainya SENGAJA diimpor oleh decision-engine dari sini, bukan didefinisikan ulang
 * di sana. Kalau dua tempat memegang angka yang sama tanpa saling tahu, sidik jari
 * bisa tetap cocok sementara perilaku nyatanya sudah berubah - kegagalan senyap yang
 * persis sama dengan yang pernah terjadi pada bobot LensScore (lihat catatan di
 * lens-score-weights.ts).
 */
export const DECISION_THRESHOLDS = {
  buyCandidateScore: 70,
  watchScore: 60,
  maxExecutableAgeMinutes: 30,
} as const;

export interface ModelParameters {
  formulaVersion: string;
  weights: { technical: number; fundamental: number; flow: number };
  totalWeight: number;
  minCoveragePct: number;
  thresholds: {
    buyCandidateScore: number;
    watchScore: number;
    maxExecutableAgeMinutes: number;
  };
}

/** Parameter yang BENAR-BENAR aktif di proses ini, dibaca dari sumbernya langsung. */
export function getActiveModelParameters(): ModelParameters {
  return {
    formulaVersion: SCORE_FORMULA_VERSION,
    weights: {
      technical: LENS_SCORE_WEIGHTS.technical,
      fundamental: LENS_SCORE_WEIGHTS.fundamental,
      flow: LENS_SCORE_WEIGHTS.flow,
    },
    totalWeight: LENS_SCORE_TOTAL_WEIGHT,
    minCoveragePct: MIN_COVERAGE_PCT,
    thresholds: {
      buyCandidateScore: DECISION_THRESHOLDS.buyCandidateScore,
      watchScore: DECISION_THRESHOLDS.watchScore,
      maxExecutableAgeMinutes: DECISION_THRESHOLDS.maxExecutableAgeMinutes,
    },
  };
}

/**
 * Serialisasi deterministik: kunci diurutkan rekursif.
 *
 * `JSON.stringify` biasa mempertahankan urutan penyisipan, jadi menyusun ulang baris
 * pada literal objek akan mengubah hash tanpa mengubah satu pun nilai. Sidik jari
 * yang berubah karena urutan penulisan adalah sidik jari yang tidak bisa dipercaya.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
}

export function canonicalParameterString(params: ModelParameters): string {
  return canonicalize(params);
}

/** Sidik jari SHA-256 dari parameter. Dipotong 16 hex - cukup untuk mendeteksi perubahan. */
export function computeParameterFingerprint(
  params: ModelParameters = getActiveModelParameters(),
): string {
  return sha256Hex(canonicalParameterString(params)).slice(0, 16);
}
