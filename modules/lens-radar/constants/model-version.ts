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
// KENAIKAN VERSI FASE 3-4 (2026-08-12, perbaikan C-05/H-04/M-10 dan Fase 4 #16).
//
// SCORE_VERSION NAIK karena nilai skornya BERUBAH - berbeda dari Fase 2 yang sengaja tidak
// menaikkannya. Dua perubahan yang menggerakkan angka:
//
//   Fase 4 #16   penjaga puncak siklus tidak lagi saklar biner di PER<8 & ROE>25. Batasnya
//                kini sebanding dengan keparahan tanda tangannya, jadi skor Valuasi emiten
//                komoditas di sekitar ambang lama berubah.
//   M-10         MACD signal line diperbaiki ke definisi baku (EMA 9 atas MACD line yang
//                SAH saja, bukan atas indeks tempat helper EMA masih mengisi konstanta
//                seed). Nilai macdHist berubah, dan macdHist masuk ke skor.
//
// VALUATION_VERSION NAIK karena PBV & PER wajar di kartu "Harga Wajar" kini memakai
// impliedMultiples() - model yang sama dengan komponen Valuasi LensScore - bukan lagi
// heuristik (ROE/12) x 0,85 dan pengali PER tetap 15x (temuan C-05).
//
// TANGGAL FREEZE OOS TIDAK DIULANG. Freeze berjalan sejak 2026-08-12 dan hari ini masih
// tanggal yang sama: belum ada satu pun sinyal forward yang matang (butuh T+20), jadi tidak
// ada sampel yang terkumpul di bawah model lama yang perlu dibuang. Kalau perubahan skor
// seperti ini terjadi SETELAH sampel forward mulai terkumpul, freeze WAJIB diulang - lihat
// catatan di walk-forward-validation.service.ts.
import { LENS_SCORE_MODEL_METADATA } from '@/modules/technical/config/lens-score-model';

export const SCORE_VERSION = LENS_SCORE_MODEL_METADATA.version;
export const VALUATION_VERSION = 'valuation-v1.3.0';
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
  score_config_hash: string;
  valuation_version: string;
  signal_version: string;
  data_snapshot_version: string;
  calculation_timestamp: string;
}

export function currentModelVersionStamp(now = new Date()): ModelVersionStamp {
  return {
    score_version: SCORE_VERSION,
    score_config_hash: LENS_SCORE_MODEL_METADATA.configHash,
    valuation_version: VALUATION_VERSION,
    signal_version: SIGNAL_VERSION,
    data_snapshot_version: DATA_SNAPSHOT_VERSION,
    calculation_timestamp: now.toISOString(),
  };
}

export function partitionByScoreVersion<T extends object>(
  rows: T[],
  requestedVersion: string | null = SCORE_VERSION,
  requestedConfigHash: string | null = LENS_SCORE_MODEL_METADATA.configHash,
): {
  version: string | null;
  accepted: T[];
  rejected: T[];
  rejectedReason: string | null;
  mixed: boolean;
  unversionedCount: number;
  configHash: string | null;
  configRejectedCount: number;
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
      configHash: requestedConfigHash,
      configRejectedCount: rows.length,
    };
  }

  const accepted: T[] = [];
  const rejected: T[] = [];
  let configRejectedCount = 0;
  for (const row of rows) {
    const scoreVersion = (row as { score_version?: string | null }).score_version;
    const rowVersion = typeof scoreVersion === 'string' ? scoreVersion.trim() : '';
    const rowHash = (row as { score_config_hash?: string | null }).score_config_hash?.trim() || '';
    if (rowVersion === version && requestedConfigHash && rowHash === requestedConfigHash) accepted.push(row);
    else {
      rejected.push(row);
      if (rowVersion === version && rowHash !== requestedConfigHash) configRejectedCount++;
    }
  }

  return {
    version: accepted.length ? version : null,
    accepted,
    rejected,
    rejectedReason: rejected.length ? `Dataset berisi histori model campuran/legacy; hanya score_version ${version} dengan config_hash ${requestedConfigHash} yang dipakai.` : null,
    mixed: counts.size > 1,
    unversionedCount,
    configHash: requestedConfigHash,
    configRejectedCount,
  };
}
