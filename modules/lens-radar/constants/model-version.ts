// KENAIKAN VERSI 2026-08-12 (perbaikan temuan C-01/C-02/C-03 audit kuantitatif).
//
// Ketiga versi di bawah naik BERSAMAAN dan itu disengaja - ketiganya berubah oleh satu
// paket perbaikan yang sama:
//
//   SCORE_VERSION          skor historis kini memakai konteks sektor point-in-time
//                          (fundamental_history.yahoo_sector/industry/payout_ratio),
//                          bukan lagi sector null yang membuat SELURUH histori dinilai
//                          'UNCLASSIFIED'. Diuji atas 110.592 kombinasi: selisih sampai
//                          10 poin dan 8,4% berpindah bucket (temuan C-02).
//   SIGNAL_VERSION         bar entry backtest wajib MAJU dari tanggal sinyal; sinyal
//                          tanpa bar maju dibuang dan dihitung, bukan dieksekusi pada
//                          bar tanggal sinyal (temuan C-03).
//   DATA_SNAPSHOT_VERSION  fundamental_history bertambah kolom sektor.
//
// KONSEKUENSI YANG DISENGAJA: partitionByScoreVersion() akan MENOLAK seluruh baris
// lens_radar_history berversi lama, sehingga Calibration Lab, Bucket Backtest, dan
// halaman Transparency menampilkan nol sampel sampai backfill dijalankan ulang. Itu
// perilaku yang benar - angka lama dihitung dengan model yang berbeda dan mencampurnya
// dengan angka baru justru yang tidak boleh terjadi. `versionRejectedReason` sudah
// menyatakannya ke pengguna. Jalankan: npm run backfill:lens-history
export const SCORE_VERSION = 'lens-score-v1.4.0';
export const VALUATION_VERSION = 'valuation-v1.2.0';
export const SIGNAL_VERSION = 'lens-radar-signal-v1.3.0';
// FASE 2 (2026-08-12): bentuk baris arsip bertambah kolom kelayakan point-in-time dan
// penyebut availableMax per kelompok (temuan H-01 & H-03).
//
// SCORE_VERSION SENGAJA TIDAK IKUT NAIK: nilai skornya tidak berubah sedikit pun -
// calculateScore() hanya mengekspos angka yang sudah dihitungnya. Menaikkannya akan
// menyatakan model berubah padahal tidak.
//
// Konsekuensinya baris yang diarsipkan di bawah v1.2.0 tidak punya kolom gerbang, dan
// gerbang populasi memperlakukannya FAIL-CLOSED. Baris itu tidak hilang diam-diam:
// jumlahnya muncul sebagai unknownCoverage/unknownEligibility di Calibration Lab dan di
// hasil bucket backtest. Jalankan ulang backfill untuk mengisinya.
export const DATA_SNAPSHOT_VERSION = 'lens-radar-history-v1.3.0';

export interface ModelVersionStamp {
  score_version: string;
  valuation_version: string;
  signal_version: string;
  data_snapshot_version: string;
  calculation_timestamp: string;
}

export function currentModelVersionStamp(now = new Date()): ModelVersionStamp {
  return {
    score_version: SCORE_VERSION,
    valuation_version: VALUATION_VERSION,
    signal_version: SIGNAL_VERSION,
    data_snapshot_version: DATA_SNAPSHOT_VERSION,
    calculation_timestamp: now.toISOString(),
  };
}

export function partitionByScoreVersion<T extends object>(
  rows: T[],
  requestedVersion: string | null = SCORE_VERSION
): {
  version: string | null;
  accepted: T[];
  rejected: T[];
  rejectedReason: string | null;
  mixed: boolean;
  unversionedCount: number;
} {
  const counts = new Map<string, number>();
  let unversionedCount = 0;

  for (const row of rows) {
    const scoreVersion = (row as { score_version?: string | null }).score_version;
    const version = typeof scoreVersion === 'string' ? scoreVersion.trim() : '';
    if (!version) {
      unversionedCount++;
      continue;
    }
    counts.set(version, (counts.get(version) ?? 0) + 1);
  }

  const version = requestedVersion?.trim() || null;

  if (!version) {
    return {
      version: null,
      accepted: [],
      rejected: rows,
      rejectedReason: rows.length ? 'Semua baris histori belum memiliki versi model.' : null,
      mixed: false,
      unversionedCount,
    };
  }

  const accepted: T[] = [];
  const rejected: T[] = [];
  for (const row of rows) {
    const scoreVersion = (row as { score_version?: string | null }).score_version;
    const rowVersion = typeof scoreVersion === 'string' ? scoreVersion.trim() : '';
    if (rowVersion === version) accepted.push(row);
    else rejected.push(row);
  }

  return {
    version: accepted.length ? version : null,
    accepted,
    rejected,
    rejectedReason: rejected.length ? `Dataset berisi histori campuran/legacy; hanya score_version ${version} yang dipakai.` : null,
    mixed: counts.size > 1,
    unversionedCount,
  };
}
