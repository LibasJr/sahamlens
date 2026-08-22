import type { IdxFinancialReport } from './idx-xbrl.service';

/**
 * Jumlah lembar saham beredar - blocker kedua sebelum XBRL IDX bisa memberi makan
 * LensScore, karena `pbv` dan `per` keduanya butuh angka ini dan artefak IDX TIDAK
 * memuatnya sebagai tag tersendiri.
 *
 * ===================================================================================
 * KENAPA TIDAK LANGSUNG PAKAI YAHOO
 * ===================================================================================
 * Karena bisa diturunkan dari laporan resminya sendiri, dan itu mempertahankan
 * keunggulan utama sumber IDX: stempel point-in-time yang sungguhan (`fileModified`).
 * Yahoo tidak menyimpan jumlah saham historis apa adanya, jadi memakainya untuk PBV/PER
 * akan menyuntikkan look-ahead ke dua rasio itu di jalur backtest.
 *
 * Turunannya: laba induk / EPS dasar. Angka itu SUDAH dihitung sebagai
 * `integrity.eps.impliedShares` di idx-xbrl.service.ts, di sana sebagai alat penjaga
 * kewajaran EPS; di sini ia dipakai sebagai nilainya sendiri - tapi HANYA kalau gerbang
 * EPS-nya lulus. Kalau EPS-nya ditolak (kasus TLKM, meleset 1e9), turunannya ikut tidak
 * dipakai. Angka yang lahir dari input yang sudah divonis salah tidak jadi benar hanya
 * karena dibagi.
 *
 * ===================================================================================
 * KONFIRMASI SILANG LEWAT MODAL SAHAM
 * ===================================================================================
 * `commonStocks` adalah modal saham dalam rupiah = jumlah lembar x nilai nominal. Jadi
 * `commonStocks / lembar` mengembalikan nilai nominal yang tersirat, dan nominal saham
 * IDX adalah angka konvensional yang mudah dikenali. Terukur TW1 2026:
 *
 *   AALI  Rp 500,0023   (nominal resmi Rp 500)
 *   BBCA  Rp 12,4877    (nominal resmi Rp 12,5)
 *   TLKM  Rp 0,0000     (EPS-nya rusak - dan langsung terlihat di sini)
 *
 * Nilai ini DILAPORKAN sebagai metadata, bukan dijadikan gerbang. Sengaja: menjadikannya
 * gerbang menuntut daftar nominal sah yang di-hardcode, dan emiten yang nominalnya tidak
 * biasa - setelah stock split, misalnya - akan ditolak bukan karena datanya salah
 * melainkan karena daftarnya tidak lengkap. Melaporkannya membuat kesalahan terlihat
 * tanpa mengarang kebenaran.
 *
 * ===================================================================================
 * YANG HARUS DIINGAT PEMAKAI: INI RATA-RATA TERTIMBANG
 * ===================================================================================
 * EPS dihitung atas rata-rata tertimbang lembar saham SELAMA periode, jadi turunannya
 * juga rata-rata tertimbang - bukan posisi akhir periode. Untuk emiten yang jumlah
 * sahamnya tidak berubah, keduanya identik. Untuk yang berubah, selisihnya nyata namun
 * kecil: BBCA melakukan buyback treasury di TW1 2026 dan selisihnya 0,1%.
 *
 * Karena itu `basis` selalu ikut di keluaran. Pemakai yang butuh posisi akhir periode
 * (mis. jumlah saham untuk kapitalisasi pasar hari ini) harus membaca field itu dan
 * memutuskan sendiri, bukan menganggap semua sumber setara.
 */

export type ShareCountSource = 'IDX_XBRL_EPS' | 'EXTERNAL_FALLBACK';

export type ShareCountBasis =
  /** Rata-rata tertimbang selama periode laporan - turunan dari EPS. */
  | 'WEIGHTED_AVERAGE_PERIOD'
  /** Posisi pada saat sumber luar itu dibaca; TIDAK point-in-time terhadap laporan. */
  | 'EXTERNAL_AS_OF_FETCH';

export interface ShareCountResult {
  shares: number | null;
  source: ShareCountSource | null;
  basis: ShareCountBasis | null;
  /** `commonStocks / shares`. Metadata konfirmasi silang, bukan gerbang - lihat catatan
   * di atas. `null` kalau modal saham tidak dilaporkan atau lembarnya tidak terselesaikan. */
  impliedParValue: number | null;
  /** Selalu terisi, termasuk saat berhasil - supaya keluaran bisa menjelaskan dirinya
   * sendiri di UI tanpa pemanggil perlu menyusun kalimatnya. */
  reason: string;
}

export interface ResolveShareCountOptions {
  /** Jumlah lembar dari sumber luar (mis. Yahoo `sharesOutstanding`). Dipakai HANYA
   * kalau turunan dari XBRL tidak tersedia. */
  externalShares?: number | null;
  /** Nama sumber luar untuk dicantumkan di `reason`. */
  externalLabel?: string;
}

/** Sama longgarnya dengan penjaga di idx-xbrl.service.ts, dan untuk alasan yang sama:
 * menangkap kesalahan beberapa ORDE, bukan menghakimi emiten yang tidak biasa. */
const MIN_PLAUSIBLE_SHARES = 1e6;
const MAX_PLAUSIBLE_SHARES = 1e13;

function isPlausibleShareCount(value: number | null | undefined): value is number {
  return (
    typeof value === 'number'
    && Number.isFinite(value)
    && value >= MIN_PLAUSIBLE_SHARES
    && value <= MAX_PLAUSIBLE_SHARES
  );
}

function impliedPar(commonStocks: number | null, shares: number | null): number | null {
  if (commonStocks == null || !Number.isFinite(commonStocks)) return null;
  if (shares == null || !Number.isFinite(shares) || shares === 0) return null;
  return commonStocks / shares;
}

export function resolveShareCount(
  report: IdxFinancialReport,
  options: ResolveShareCountOptions = {},
): ShareCountResult {
  const { externalShares = null, externalLabel = 'sumber luar' } = options;
  const commonStocks = report.current.commonStocks;
  const eps = report.integrity.eps;

  // Jalur utama. Syaratnya dua, dan keduanya harus dinyatakan terpisah: gerbang EPS
  // lulus, DAN turunannya positif. `plausible` menilai BESARAN lewat nilai mutlak, jadi
  // emiten yang tanda EPS-nya tidak konsisten dengan tanda labanya (mis. rugi tapi EPS
  // dilaporkan positif) bisa lolos gerbang itu dengan lembar tersirat negatif.
  if (eps.plausible === true && isPlausibleShareCount(eps.impliedShares)) {
    const shares = eps.impliedShares;
    return {
      shares,
      source: 'IDX_XBRL_EPS',
      basis: 'WEIGHTED_AVERAGE_PERIOD',
      impliedParValue: impliedPar(commonStocks, shares),
      reason: 'Diturunkan dari laba induk / EPS dasar pada laporan resmi BEI '
        + `(${report.ticker} ${report.period} ${report.year}). Rata-rata tertimbang selama periode.`,
    };
  }

  if (isPlausibleShareCount(externalShares)) {
    const rejected = eps.plausible === false
      ? 'EPS pada laporan resmi ditolak gerbang kewajaran'
      : 'EPS atau laba induk tidak dilaporkan sehingga turunannya tidak bisa dihitung';
    return {
      shares: externalShares,
      source: 'EXTERNAL_FALLBACK',
      basis: 'EXTERNAL_AS_OF_FETCH',
      impliedParValue: impliedPar(commonStocks, externalShares),
      reason: `${rejected}; dipakai ${externalLabel}. Angka ini TIDAK point-in-time terhadap laporan.`,
    };
  }

  return {
    shares: null,
    source: null,
    basis: null,
    impliedParValue: null,
    reason: eps.plausible === false
      ? 'EPS pada laporan resmi ditolak gerbang kewajaran dan tidak ada sumber cadangan yang wajar.'
      : 'EPS atau laba induk tidak dilaporkan, dan tidak ada sumber cadangan yang wajar.',
  };
}
