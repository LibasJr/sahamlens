import type { FundamentalInput, SectorContext } from '../../technical';
import type { IdxFinancialReport } from './idx-xbrl.service';
import { resolveShareCount, type ShareCountResult } from './share-count.service';

/**
 * Merakit `FundamentalInput` LensScore dari laporan resmi BEI (XBRL).
 *
 * Ini penyambung antara tiga bagian yang sudah ada - pos lancar, jumlah lembar saham,
 * dan pertumbuhan pendapatan - menjadi satu bentuk yang bisa diterima
 * `calculateScore()` di modules/technical/service/scoring.service.ts.
 *
 * ===================================================================================
 * DUA DARI ENAM FIELD SENGAJA DIKOSONGKAN: `roe` DAN `per`
 * ===================================================================================
 * Keduanya butuh laba SETAHUN. Laporan kuartalan memuat laba periode berjalan saja,
 * dan memakainya mentah-mentah menghasilkan angka yang salah tanpa terlihat salah:
 *
 *   AALI TW1 2026, laba induk Rp 373 M atas ekuitas Rp 23,9 T
 *     ROE dari laba TW1 saja  1,56%   -> LensScore menilainya emiten buruk
 *     ROE disetahunkan x4     6,24%   -> tebakan, dan AALI labanya musiman
 *
 * Mengalikan empat bukan "menyetahunkan", itu mengarang: ia mengandaikan laba tersebar
 * rata sepanjang tahun, yang justru tidak berlaku pada emiten perkebunan, komoditas,
 * dan ritel - persis kelompok yang paling sering salah dinilai di aplikasi ini.
 *
 * Jadi keduanya `null` dengan alasan yang dinyatakan. `calculateScore()` sudah menangani
 * null dengan benar: bobotnya keluar dari `availableMax` sementara `declaredMax` tetap,
 * sehingga kehilangannya TERLIHAT di `coverage_pct` alih-alih tersamar jadi skor rendah.
 *
 * Keduanya baru bisa diisi setelah ada empat kuartal berurutan (TTM) di
 * `data/idx-financial/` - itu pekerjaan sync historis, bukan pekerjaan file ini.
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

  // ── ROE & PER: sengaja null, lihat blok penjelasan di atas ──
  const ttmReason = 'Butuh laba dua belas bulan terakhir; laporan kuartalan hanya memuat laba '
    + 'periode berjalan, dan mengalikannya empat mengandaikan laba tersebar rata sepanjang '
    + 'tahun - tidak berlaku untuk emiten musiman.';
  note('roe', false, ttmReason);
  note('per', false, ttmReason);

  const marketCap = positive(price) && positive(shareCount.shares) ? price * shareCount.shares : null;

  return {
    input: {
      per: null,
      pbv,
      roe: null,
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
