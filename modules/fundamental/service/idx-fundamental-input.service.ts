import type { FundamentalInput, SectorContext } from '../../technical';
import type { IdxFinancialReport } from './idx-xbrl.service';
import { resolveShareCount, type ShareCountResult } from './share-count.service';

/**
 * Merakit `FundamentalInput` LensScore dari laporan resmi BEI (XBRL).
 *
 * Ini penyambung antara bagian-bagian yang sudah ada - pos lancar, jumlah lembar saham,
 * dan pertumbuhan pendapatan - menjadi satu bentuk yang bisa diterima
 * `calculateScore()` di modules/technical/service/scoring.service.ts.
 *
 * ===================================================================================
 * `roe` DAN `per` DIISI HANYA KALAU PERIODENYA TERBUKTI DUA BELAS BULAN
 * ===================================================================================
 * Keduanya butuh laba SETAHUN. Laporan kuartalan memuat laba periode berjalan saja, dan
 * memakainya mentah-mentah menghasilkan angka yang salah tanpa terlihat salah:
 *
 *   AALI TW1 2026, laba induk Rp 373 M atas ekuitas Rp 23,9 T
 *     ROE dari laba TW1 saja  1,56%   -> LensScore menilainya emiten buruk
 *     ROE disetahunkan x4     6,24%   -> tebakan, dan AALI labanya musiman
 *
 * Mengalikan empat bukan "menyetahunkan", itu mengarang: ia mengandaikan laba tersebar
 * rata sepanjang tahun, yang justru tidak berlaku pada emiten perkebunan, komoditas,
 * dan ritel - persis kelompok yang paling sering salah dinilai di aplikasi ini. Itu
 * TETAP dilarang di sini, dan kuartalan tetap keluar `null`.
 *
 * Yang berubah: laporan tahunan auditan memuat laba dua belas bulan yang SUNGGUHAN, jadi
 * tidak ada yang perlu disetahunkan. Syaratnya dibuktikan dari konteks laporannya sendiri
 * (`periodStart`..`periodEnd`), bukan dari label `period` - label itu bagian nama berkas,
 * dan gerbang yang percaya pada nama akan lulus terhadap berkas yang isinya lain.
 *
 * Diukur atas seluruh `data/idx-financial/` pada 23 Agustus 2026, 2.512 artefak:
 *
 *   AUDIT  365 hari  x882      <- dua belas bulan, boleh
 *   TW2    181 hari  x783      <- ditolak
 *   TW1    89-91 hari x847     <- ditolak
 *
 * Jaraknya lebar (181 lawan 365), jadi ambangnya tidak perlu ketat: 330-380 hari
 * menerima tahun kabisat (366) dan tahun buku 53 minggu (371) tanpa mendekati TW2.
 *
 * Kalau syaratnya tidak terpenuhi, keduanya `null` dengan alasan yang dinyatakan.
 * `calculateScore()` sudah menangani null dengan benar: bobotnya keluar dari
 * `availableMax` sementara `declaredMax` tetap, sehingga kehilangannya TERLIHAT di
 * `coverage_pct` alih-alih tersamar jadi skor rendah.
 *
 * ===================================================================================
 * HARGA DATANG DARI LUAR, DAN ITU MENCAMPUR DUA JENIS WAKTU
 * ===================================================================================
 * `pbv` butuh harga pasar, dan harga bukan isi laporan keuangan. Ia diterima sebagai
 * argumen, tidak dicari sendiri oleh file ini.
 *
 * Akibatnya `pbv` adalah campuran: nilai buku ber-stempel point-in-time `fileModified`,
 * dikali harga pada saat fungsi ini dipanggil. Untuk penilaian hari ini itu benar. Untuk
 * backtest, pemanggil WAJIB memasok harga pada tanggal sinyal - kalau ia memasok harga
 * hari ini, hasilnya look-ahead, dan tidak ada di dalam file ini yang bisa mencegahnya.
 */

/** Alasan per field, supaya keluaran bisa menjelaskan dirinya sendiri di UI tanpa
 * pemanggil menyusun kalimatnya - pola yang sama dengan `reason` di Component. */
export interface IdxFundamentalFieldNote {
  field: 'per' | 'pbv' | 'roe' | 'der' | 'currentRatio' | 'revenueGrowth';
  available: boolean;
  reason: string;
}

export interface IdxFundamentalInputResult {
  input: FundamentalInput;
  notes: IdxFundamentalFieldNote[];
  shareCount: ShareCountResult;
  /** Stempel point-in-time laporannya - diteruskan supaya pemanggil bisa mencatat
   * kapan angka ini SAH, bukan kapan ia dibaca. */
  fileModified: string | null;
}

export interface BuildIdxFundamentalInputOptions {
  /** Harga pasar. Untuk backtest: harga pada tanggal sinyal, bukan harga hari ini. */
  price?: number | null;
  /** Jumlah lembar cadangan (mis. Yahoo) - hanya dipakai kalau turunan XBRL gagal. */
  externalShares?: number | null;
  externalLabel?: string;
  sector?: SectorContext;
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function positive(value: number | null | undefined): value is number {
  return finite(value) && value > 0;
}

/** Ambang "dua belas bulan", dalam hari. Lihat sebaran terukur di kepala berkas: yang
 * perlu dibedakan cuma 365 (auditan) dari 181 (TW2), jadi jendela selebar ini aman
 * sekaligus menerima tahun kabisat dan tahun buku 53 minggu. */
const TWELVE_MONTH_MIN_DAYS = 330;
const TWELVE_MONTH_MAX_DAYS = 380;

/** Panjang periode laporan dalam hari, dihitung dari konteksnya sendiri. `null` kalau
 * salah satu ujungnya tidak dilaporkan - dan `null` di sini berarti "tidak terbukti",
 * yang diperlakukan sama tegasnya dengan "terbukti bukan setahun". */
function reportedPeriodDays(report: IdxFinancialReport): number | null {
  if (!report.periodStart || !report.periodEnd) return null;
  const start = Date.parse(`${report.periodStart}T00:00:00Z`);
  const end = Date.parse(`${report.periodEnd}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  // Inklusif kedua ujungnya: 2025-01-01..2025-12-31 adalah 365 hari, bukan 364.
  return Math.round((end - start) / 86_400_000) + 1;
}

export function buildIdxFundamentalInput(
  report: IdxFinancialReport,
  options: BuildIdxFundamentalInputOptions = {},
): IdxFundamentalInputResult {
  const { price = null, externalShares = null, externalLabel, sector } = options;
  const fig = report.current;
  const notes: IdxFundamentalFieldNote[] = [];
  const shareCount = resolveShareCount(report, { externalShares, externalLabel });

  const note = (field: IdxFundamentalFieldNote['field'], available: boolean, reason: string) => {
    notes.push({ field, available, reason });
  };

  // ── PBV ──
  // Nilai buku per lembar dari ekuitas INDUK, bukan ekuitas total: kepentingan
  // nonpengendali bukan milik pemegang saham emiten ini.
  let pbv: number | null = null;
  if (!positive(price)) {
    note('pbv', false, 'Harga pasar tidak dipasok pemanggil; PBV tidak bisa dihitung dari laporan saja.');
  } else if (!positive(fig.equityAttributableToParent)) {
    note('pbv', false, 'Ekuitas induk tidak dilaporkan atau tidak positif.');
  } else if (!positive(shareCount.shares)) {
    note('pbv', false, `Jumlah lembar saham tidak terselesaikan: ${shareCount.reason}`);
  } else {
    pbv = price / (fig.equityAttributableToParent / shareCount.shares);
    note('pbv', true, `Harga dibagi nilai buku induk per lembar (${shareCount.source}, ${shareCount.basis}).`);
  }

  // ── DER ──
  // Liabilitas dipakai APA ADANYA seperti dilaporkan. Dana syirkah temporer TIDAK
  // ditambahkan ke pembilang: di neraca resmi ia pos tersendiri di luar liabilitas, dan
  // memindahkannya berarti menyusun ulang neraca emiten menurut tafsir kita sendiri.
  let der: number | null = null;
  if (!finite(fig.liabilities) || !positive(fig.equity)) {
    der = null;
    note('der', false, 'Liabilitas atau ekuitas tidak dilaporkan.');
  } else {
    der = fig.liabilities / fig.equity;
    note('der', true, 'Liabilitas dibagi ekuitas, keduanya apa adanya dari neraca resmi.');
  }

  // ── Current ratio ──
  // Bank tidak melaporkan pos lancar sama sekali - neracanya disusun menurut likuiditas.
  // Ini keadaan SAH, bukan data hilang, dan total aset/liabilitas TIDAK boleh dipakai
  // sebagai pengganti: angkanya akan terlihat wajar dan artinya sepenuhnya salah.
  let currentRatio: number | null = null;
  if (!finite(fig.currentAssets) || !positive(fig.currentLiabilities)) {
    note('currentRatio', false,
      'Emiten tidak mengklasifikasikan pos lancar/tidak lancar - lazim untuk bank, yang '
      + 'menyusun neraca menurut likuiditas. Tidak diganti dengan total aset/liabilitas.');
  } else {
    currentRatio = fig.currentAssets / fig.currentLiabilities;
    note('currentRatio', true, 'Aset lancar dibagi liabilitas lancar.');
  }

  // ── Revenue growth yoy ──
  // `prior` dibaca dari konteks PriorYearDuration, yaitu PERIODE YANG SAMA tahun
  // sebelumnya - jadi ini perbandingan sejenis, bukan kuartal lawan setahun penuh.
  let revenueGrowth: number | null = null;
  if (!positive(fig.revenue) || !positive(report.prior.revenue)) {
    note('revenueGrowth', false, 'Pendapatan periode berjalan atau periode sebanding tahun lalu tidak dilaporkan.');
  } else {
    revenueGrowth = ((fig.revenue - report.prior.revenue) / report.prior.revenue) * 100;
    note('revenueGrowth', true, `Pendapatan ${report.period} ${report.year} dibanding periode yang sama ${report.year - 1}.`);
  }

  // ── ROE & PER: hanya kalau periodenya terbukti dua belas bulan ──
  // Lihat blok penjelasan di kepala berkas. Keputusannya diambil dari rentang tanggal di
  // laporan, bukan dari label `period`.
  const periodDays = reportedPeriodDays(report);
  const isTwelveMonths = periodDays !== null
    && periodDays >= TWELVE_MONTH_MIN_DAYS
    && periodDays <= TWELVE_MONTH_MAX_DAYS;

  let roe: number | null = null;
  let per: number | null = null;

  if (!isTwelveMonths) {
    const reason = periodDays === null
      ? 'Panjang periode laporan tidak bisa dibuktikan dari konteksnya, jadi laba di dalamnya '
        + 'tidak boleh diperlakukan sebagai laba setahun.'
      : `Laporan ini mencakup ${periodDays} hari, bukan dua belas bulan. Laba periode berjalan `
        + 'tidak disetahunkan: mengalikannya mengandaikan laba tersebar rata sepanjang tahun, '
        + 'dan itu tidak berlaku untuk emiten musiman.';
    note('roe', false, reason);
    note('per', false, reason);
  } else {
    // ROE - laba induk atas ekuitas induk. Keduanya "induk", tidak dicampur: kepentingan
    // nonpengendali bukan milik pemegang saham emiten ini, pola yang sama dengan PBV.
    if (!finite(fig.profitLossAttributableToParent)) {
      note('roe', false, 'Laba bersih yang dapat diatribusikan ke pemilik induk tidak dilaporkan.');
    } else if (!positive(fig.equityAttributableToParent)) {
      // Ekuitas induk negatif terjadi pada 35 dari 882 emiten auditan 2025. ROE di atasnya
      // TIDAK dihitung: emiten yang rugi dengan ekuitas negatif menghasilkan ROE POSITIF
      // karena dua tanda minus saling meniadakan - terbaca sehat, padahal sebaliknya.
      note('roe', false,
        'Ekuitas induk tidak positif. ROE atas ekuitas negatif tidak punya arti - emiten yang '
        + 'rugi justru akan terbaca ROE positif karena kedua tandanya saling meniadakan.');
    } else {
      roe = (fig.profitLossAttributableToParent / fig.equityAttributableToParent) * 100;
      note('roe', true,
        `Laba bersih induk ${report.period} ${report.year} (${periodDays} hari) dibagi ekuitas `
        + 'induk akhir periode. Laba rugi dibiarkan negatif - itu keadaan yang dilaporkan, '
        + 'bukan data hilang.');
    }

    // PER - harga dibagi EPS DASAR YANG DILAPORKAN emiten, bukan EPS susunan sendiri.
    if (!positive(price)) {
      note('per', false, 'Harga pasar tidak dipasok pemanggil; PER tidak bisa dihitung dari laporan saja.');
    } else if (!finite(fig.basicEps)) {
      note('per', false, 'EPS dasar tidak dilaporkan dalam laporan ini.');
    } else if (!positive(fig.basicEps)) {
      note('per', false,
        'EPS dasar nol atau negatif. PER atas laba negatif tidak punya arti sebagai penilaian - '
        + 'dilaporkan sebagai tidak tersedia, bukan sebagai angka.');
    } else {
      per = price / fig.basicEps;
      note('per', true,
        `Harga dibagi EPS dasar yang dilaporkan emiten untuk ${report.period} ${report.year} `
        + `(${periodDays} hari). Harganya harga saat fungsi ini dipanggil, EPS-nya ber-stempel `
        + 'point-in-time laporan - campuran waktu yang sama dengan PBV.');
    }
  }

  const marketCap = positive(price) && positive(shareCount.shares) ? price * shareCount.shares : null;

  return {
    input: {
      per,
      pbv,
      roe,
      der,
      currentRatio,
      revenueGrowth,
      sharesOutstanding: shareCount.shares,
      marketCap,
      sector,
    },
    notes,
    shareCount,
    fileModified: report.fileModified,
  };
}
