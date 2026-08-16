import type {
  FreshnessStatus,
  OwnershipDeltaSet,
  OwnershipTrend,
  SourceCadence,
} from '../types/ownership-flow.types';

// KLASIFIKASI DESKRIPTIF + FRESHNESS.
//
// Modul ini SENGAJA tidak menghasilkan skor 0-100 dan tidak menghasilkan
// BUY/SELL. Ownership Flow adalah supplemental evidence: ia menjelaskan apa yang
// terjadi pada komposisi kepemilikan, bukan meramalkan harga. Klaim prediktif
// baru boleh dibuat setelah diuji di Validation/Calibration Lab (§33).

/**
 * Ambang klasifikasi BELUM tervalidasi.
 *
 * Untuk menetapkan "berapa pp yang layak disebut akumulasi", kita perlu
 * distribusi historis delta kepemilikan lintas emiten - dan histori itu baru
 * mulai terkumpul sejak modul ini aktif. Menetapkan angka sekarang (mis.
 * "+0.1 pp = akumulasi kuat") berarti mengarang ambang, persis yang dilarang
 * §13. Selama flag ini false, klasifikasi mengembalikan DATA_ONLY dan UI hanya
 * menampilkan angka delta apa adanya.
 *
 * Cara mengubahnya nanti: jalankan audit distribusi di Calibration Lab, catat
 * persentil yang dipakai, baru set true bersama ambang hasil audit itu.
 */
export const OWNERSHIP_TREND_THRESHOLDS_VALIDATED = false;

/**
 * Ambang kandidat (pp) - TIDAK dipakai selama flag di atas false. Disimpan di
 * sini supaya diskusi kalibrasi punya satu tempat, bukan tersebar di UI.
 */
export const CANDIDATE_TREND_THRESHOLD_PP = 0.25;

export interface TrendClassification {
  trend: OwnershipTrend;
  /** Alasan yang bisa dibaca manusia - dipakai UI dan LensAI apa adanya. */
  reason: string;
}

export interface ClassifyOptions {
  /** Horizon utama yang jadi dasar klasifikasi. Default 30 hari. */
  thresholdsValidated?: boolean;
  thresholdPp?: number;
}

/**
 * Tentukan label tren dari kumpulan delta.
 *
 * Selama ambang belum tervalidasi, hasilnya SELALU DATA_ONLY (kecuali memang
 * tidak ada data sama sekali - INSUFFICIENT_DATA). Ini bukan kemunduran fitur;
 * ini menolak memberi label yang tidak punya dasar empiris.
 */
export function classifyOwnershipTrend(
  delta: OwnershipDeltaSet,
  options: ClassifyOptions = {}
): TrendClassification {
  const validated = options.thresholdsValidated ?? OWNERSHIP_TREND_THRESHOLDS_VALIDATED;
  const threshold = options.thresholdPp ?? CANDIDATE_TREND_THRESHOLD_PP;

  // Horizon terpanjang yang benar-benar punya pembanding. Delta 30 hari lebih
  // tahan derau daripada 1 hari, jadi ia yang diutamakan bila tersedia.
  const primary = delta.d30.pp !== null ? delta.d30 : delta.d7.pp !== null ? delta.d7 : delta.d1;

  if (primary.pp === null) {
    return {
      trend: 'INSUFFICIENT_DATA',
      reason:
        'Belum ada observasi pembanding pada horizon mana pun, jadi perubahan kepemilikan belum dapat dihitung.',
    };
  }

  if (!validated) {
    return {
      trend: 'DATA_ONLY',
      reason:
        `Perubahan kepemilikan asing tercatat ${formatPp(primary.pp)} selama ${primary.actualGapDays} hari kalender terakhir. ` +
        'Label akumulasi/distribusi belum diberikan karena ambangnya belum divalidasi terhadap distribusi historis.',
    };
  }

  if (primary.pp >= threshold) {
    return {
      trend: 'FOREIGN_ACCUMULATION',
      reason: `Kepemilikan asing naik ${formatPp(primary.pp)} dalam ${primary.actualGapDays} hari kalender, melewati ambang ${threshold} pp.`,
    };
  }
  if (primary.pp <= -threshold) {
    return {
      trend: 'FOREIGN_DISTRIBUTION',
      reason: `Kepemilikan asing turun ${formatPp(primary.pp)} dalam ${primary.actualGapDays} hari kalender, melewati ambang ${threshold} pp.`,
    };
  }
  return {
    trend: 'STABLE',
    reason: `Perubahan kepemilikan asing ${formatPp(primary.pp)} masih di dalam ambang ${threshold} pp.`,
  };
}

/** "+0.51 pp" / "-1.32 pp" - satuan ikut supaya tidak terbaca sebagai persen. */
export function formatPp(pp: number): string {
  const sign = pp > 0 ? '+' : '';
  return `${sign}${pp.toFixed(2)} pp`;
}

/**
 * Batas umur data (hari kalender) sebelum disebut STALE, PER CADENCE SUMBER.
 *
 * Angka-angka ini diturunkan dari cadence, bukan dipukul rata "3 hari" (§18):
 * data bulanan yang berumur 20 hari itu NORMAL, sedangkan data harian yang
 * berumur 20 hari jelas macet.
 */
export const STALE_AFTER_DAYS: Record<SourceCadence, number | null> = {
  // Harian: akhir pekan panjang (Jumat -> Selasa setelah libur) bisa membuat
  // observasi terbaru berumur 4 hari tanpa ada yang rusak.
  DAILY: 4,
  WEEKLY: 10,
  // Bulanan: posisi akhir bulan + jeda publikasi. 40 hari memberi ruang untuk
  // bulan 31 hari plus keterlambatan terbit beberapa hari.
  MONTHLY: 40,
  // Cadence belum diketahui -> kita TIDAK PUNYA DASAR menyebut data ini segar.
  // Fail-closed: tandai STALE, jangan mengarang ambang.
  UNKNOWN: null,
};

export interface FreshnessAssessment {
  freshness: FreshnessStatus;
  ageDays: number | null;
}

/**
 * Nilai kesegaran observasi terhadap "sekarang".
 *
 * MISSING = tidak ada observasi sama sekali. STALE = ada, tapi lebih tua dari
 * yang wajar untuk cadence sumbernya. UI wajib tetap menampilkan tanggal
 * observasinya ("Data per 15 Agu 2026") apa pun statusnya, supaya pembaca tidak
 * pernah mengira data lama adalah data hari ini.
 */
export function assessFreshness(
  observedDate: string | null,
  cadence: SourceCadence,
  now: Date = new Date()
): FreshnessAssessment {
  if (!observedDate) return { freshness: 'MISSING', ageDays: null };

  const [y, m, d] = observedDate.split('-').map(Number);
  const observedMs = Date.UTC(y, m - 1, d);
  const nowMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const ageDays = Math.round((nowMs - observedMs) / 86_400_000);

  const limit = STALE_AFTER_DAYS[cadence];
  if (limit === null) return { freshness: 'STALE', ageDays };
  return { freshness: ageDays <= limit ? 'FRESH' : 'STALE', ageDays };
}
