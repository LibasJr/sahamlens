/**
 * SahamLens Scoring Engine - IDX Algorithmic Suite
 *
 * Menghitung skor komposit 0-100 dari 3 kategori:
 * - Technical (bobot maksimum 40)
 * - Fundamental (bobot maksimum 30)
 * - Flow / arus dana (bobot maksimum 30)
 *
 * ATURAN (audit logika & algoritma 2026-08-05):
 * 1. Fungsi ini HANYA menginterpretasi data input dari analyzer. Tidak pernah menghitung
 *    indikator sendiri, tidak pernah menebak.
 * 2. Input yang TIDAK TERSEDIA wajib dikirim `null`, BUKAN angka default. Komponen yang
 *    datanya tidak ada DIKELUARKAN dari perhitungan dan bobot sisanya dinormalisasi ulang
 *    (lihat `combine()`), sehingga ketiadaan data tidak pernah berubah menjadi poin.
 * 3. Satu kuantitas hanya boleh dinilai SATU KALI.
 *
 * REWRITE (audit logika & algoritma 2026-08-05) - tiga cacat yang diperbaiki di sini:
 *
 * - Temuan C-7: pemanggil mengirim `rsi: 50` saat RSI tidak tersedia, dan 50 masuk persis
 *   ke pita "zona BUY ideal" (+8 dari 15 poin). Ketiadaan data dihadiahi skor. Sekarang
 *   `rsi: null` membuat komponen RSI tidak dihitung sama sekali.
 *
 * - Temuan H-1: `scoreAsing()` dan `scoreBandar()` menyekor KUANTITAS YANG SAMA dua kali.
 *   Status `foreignFlow` ("NET BUY"/"NET SELL") dihasilkan `analyzeAccumulationSignal()`
 *   yang syarat pertamanya `cmf20 > 15`, sementara `scoreBandar()` menyekor `cmf20` itu
 *   sendiri - 30 dari 100 poin ditentukan satu angka. Perbaikan temuan H-07 sebelumnya
 *   mengklaim keduanya "dimensi berbeda"; itu tidak benar. Sekarang arus dana dinilai
 *   sebagai SATU kelompok: besaran tekanan (CMF20) + persistensinya (streak hari
 *   berturut-turut & konfirmasi volume) - dua sifat berbeda dari deret yang sama, masing-
 *   masing dinilai sekali.
 *
 * - Temuan H-14: komponen yang datanya tidak ada (mis. bank tidak punya DER di Yahoo,
 *   emiten rugi tidak punya PER) dulu menyumbang 0 poin TANPA renormalisasi bobot,
 *   sehingga bank & emiten rugi otomatis kehilangan skor fundamental bukan karena
 *   fundamentalnya buruk. `modules/market/service/screener.service.ts:scoreStock()` sudah
 *   melakukan renormalisasi ini sejak temuan H-04; sekarang disamakan di sini.
 */

import { SCORING_KATEGORI_THRESHOLDS } from './decision-thresholds';
import { resolveSectorProfile, isPeakCycleSignature } from '@/modules/sector';
import {
  impliedMultiples,
  scoreMultipleRatio,
} from '@/modules/fundamental/service/fair-multiples.service';

export interface TechnicalInput {
  currentPrice: number | null;
  ma20: number | null;
  ma50: number | null;
  /** WAJIB null kalau histori < 200 bar - jangan pernah mengirim rata-rata bar seadanya
   * yang dilabeli MA200 (temuan H-2). */
  ma200: number | null;
  rsi: number | null;
  macdHist: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  volToday: number | null;
  volAvg20: number | null;
  /** Perubahan harga hari ini dalam persen. Dipakai `scoreVolume()` untuk membedakan
   * lonjakan volume yang MENGIKUTI kenaikan harga (akumulasi) dari lonjakan volume saat
   * harga anjlok (panic selling / distribusi) - temuan P1-8. `null` = arah tidak
   * diketahui, dan volume besar tanpa arah TIDAK diberi poin penuh. */
  changePct?: number | null;
}

/** Konteks sektor + risiko emiten untuk penilaian fundamental.
 *
 * Ditambahkan untuk menutup temuan P1-10/P1-11/P1-12 (review kuantitatif 2026-08-05):
 * satu set ambang PER/PBV/DER untuk seluruh emiten IDX salah secara sistematis - bank
 * dihukum karena leverage yang justru model bisnisnya, emiten konsumen primer dihukum
 * karena pengganda yang memang secara struktural lebih tinggi, dan emiten komoditas
 * diberi nilai valuasi maksimum tepat di puncak siklus labanya.
 *
 * SELURUH field opsional: pemanggil lama yang belum memasoknya tetap berjalan (perlakuan
 * 'UNCLASSIFIED' + beta acuan), hanya tidak mendapat penyesuaian sektornya. */
export interface SectorContext {
  /** `assetProfile.sector` dari Yahoo. */
  yahooSector?: string | null;
  /** `assetProfile.industry` dari Yahoo - membedakan bank/multifinance dari emiten
   * lain yang sektornya terklasifikasi sama. */
  yahooIndustry?: string | null;
  /** Beta terhadap IHSG (modules/market/service/beta.service.ts). `null`/tidak diisi =
   * pakai beta acuan sektor, dan itu dinyatakan di keluaran. */
  beta?: number | null;
  /** Rasio pembayaran dividen 0-1 (`summaryDetail.payoutRatio`). Dibutuhkan untuk PER
   * wajar Gordon; tanpa ini komponen PER dinilai lewat earnings yield vs cost of equity. */
  payoutRatio?: number | null;
}

export interface FundamentalInput {
  per: number | null;
  pbv: number | null;
  roe: number | null;  // persen (mis. 18.2)
  der: number | null;  // rasio (mis. 0.4)
  currentRatio: number | null;
  revenueGrowth: number | null; // yoy persen
  /** Opsional - lihat SectorContext. Tanpa ini penilaian jatuh ke perlakuan netral. */
  sector?: SectorContext;
}

export interface FlowInput {
  /** Chaikin Money Flow 20 hari, persen -100..100 (modules/market/service/
   * foreign-flow-proxy.ts). `null` = tidak bisa dihitung -> seluruh kelompok Flow
   * dikeluarkan dari skor, bukan diberi nilai tengah. */
  cmf20: number | null;
  /** Hasil konfirmasi 4-lapis analyzeAccumulationSignal(). `null` kalau tidak dihitung. */
  accumulationStatus: 'AKUMULASI' | 'DISTRIBUSI' | 'NETRAL' | null;
  consecutiveBuyDays: number;
  consecutiveSellDays: number;
  /** volume hari ini / rata-rata 20 hari - dipakai HANYA sebagai konfirmasi persistensi
   * di kelompok Flow. Besaran volume itu sendiri sudah dinilai penuh di scoreVolume()
   * (kelompok Technical), jadi TIDAK boleh disekor lagi sebagai poin tersendiri. */
  volRatio: number | null;
  /** Proporsi hari dengan MFM > 0 dalam 20 hari terakhir (0-1), dari
   * `analyzeAccumulationSignal()`. Ini ukuran PERSISTENSI yang benar - lihat P1-9 di
   * `scoreFlowPersistensi()`. `null`/tidak diisi = jendela belum penuh, penilaian jatuh
   * balik ke streak dengan alasan yang menyatakannya. */
  mfmPositiveRatio20?: number | null;
}

export type ScoringKategori = 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'DATA TIDAK CUKUP';

/** Satu komponen skor.
 *
 * BUG FIX P0-2 (blueprint quant V2 §2): dulu ada SATU field `max`, dan
 * scoreValuasi/scoreProfitabilitas/scoreKesehatan MENGECILKAN `max`-nya sendiri saat
 * salah satu sub-metrik hilang (mis. emiten rugi tanpa PER: max 10 -> 5). `combine()`
 * menghitung penyebut `declaredMax` dari field yang sama, jadi penyebutnya ikut
 * menyusut dan rasionya tetap 1.0 - kehilangan separuh blok valuasi jadi TIDAK TERLIHAT
 * di `coverage_pct` (dilaporkan 100% padahal 5 dari 13 sub-faktor hilang).
 *
 * Sekarang dua angka dipisah tegas:
 * - `declaredMax`: bobot yang DIDEKLARASIKAN untuk komponen ini. KONSTAN (15/8/7/10/
 *   10/10/10/20/10) apa pun ketersediaan datanya. Ini penyebutnya.
 * - `availableMax`: bobot sub-faktor yang BENAR-BENAR punya data. Ini pembilangnya.
 *
 * `available: false` berarti seluruh komponen tidak punya data: `availableMax = 0`,
 * `declaredMax` tetap penuh - jadi hilangnya terlihat di coverage. */
interface Component {
  key: string;
  score: number;
  /** Bobot sub-faktor yang punya data (<= declaredMax). */
  availableMax: number;
  /** Bobot konstan komponen ini - TIDAK PERNAH menyusut karena data hilang. */
  declaredMax: number;
  available: boolean;
  reason: string;
  /** Peringatan metodologis yang WAJIB sampai ke pengguna walau komponen ini tidak
   * masuk 3 alasan teratas (mis. pola laba puncak siklus). Digabungkan ke `risk`.
   *
   * Ada karena pola kegagalan yang berulang di seluruh audit aplikasi ini: nilai
   * dihitung dengan benar di backend lalu tidak pernah dirender, sehingga pengguna
   * melihat kesimpulan tanpa syaratnya. */
  caveat?: string;
}

export interface ScoringResult {
  simbol: string;
  harga: number | null;
  technical_score: number;
  fundamental_score: number;
  flow_score: number;
  total_score: number;
  /** Persentase bobot SUB-FAKTOR yang benar-benar punya data, terhadap bobot sub-faktor
   * yang dideklarasikan (0-100). Di bawah MIN_COVERAGE_PCT, `kategori` menjadi
   * 'DATA TIDAK CUKUP' - skor dari sepotong kecil data tidak boleh disajikan sebagai
   * rekomendasi.
   *
   * P0-2: sebelum perbaikan, angka ini melebih-lebihkan kelengkapan - emiten rugi tanpa
   * PER dilaporkan 100% padahal separuh blok valuasi hilang. Nilainya sekarang TURUN
   * untuk banyak saham; itu koreksi, bukan regresi. */
  coverage_pct: number;
  kategori: ScoringKategori;
  detail: {
    ma_trend: number | null;
    rsi: number | null;
    macd: number | null;
    volume: number | null;
    valuasi: number | null;
    profitabilitas: number | null;
    kesehatan: number | null;
    flow_tekanan: number | null;
    flow_persistensi: number | null;
  };
  /** Komponen yang tidak punya data - ditampilkan apa adanya ke pengguna, bukan
   * disembunyikan seolah semuanya terhitung. */
  missing: string[];
  /** Komponen yang TIDAK BERLAKU untuk sektor emiten ini (mis. DER/Current Ratio untuk
   * bank). Dipisah dari `missing` karena maknanya berbeda: yang ini bukan kekurangan
   * data dan TIDAK menurunkan `coverage_pct`. Menyatukan keduanya akan membuat bank
   * selalu terlihat "datanya kurang" padahal pertanyaannya yang memang tidak berlaku. */
  not_applicable: string[];
  alasan_3_poin: string[];
  risk: string;
}

const NA = (key: string, declaredMax: number, what: string): Component => ({
  key, score: 0, availableMax: 0, declaredMax, available: false,
  reason: `${what}: DATA TIDAK TERSEDIA`,
});

/** Komponen yang TIDAK BERLAKU untuk sektor emiten ini - berbeda tegas dari "datanya
 * tidak ada" (blueprint quant V2 §6.6).
 *
 * `declaredMax: 0` membuatnya keluar dari PEMBILANG maupun PENYEBUT `combine()`, jadi
 * bobotnya direnormalisasi ke komponen yang berlaku dan `coverage_pct` TIDAK turun.
 * Ini yang membedakannya dari `NA()`:
 *
 *   NA()             -> "seharusnya ada, tapi sumber datanya tidak memberi" -> coverage TURUN
 *   NOT_APPLICABLE() -> "pertanyaannya memang tidak berlaku di sini"        -> coverage TETAP
 *
 * Contoh: Current Ratio untuk bank. Bank tidak memisahkan aset lancar/tidak lancar dalam
 * pengertian yang sama, jadi ketiadaannya bukan kekurangan data - dan menghukum
 * kelengkapan datanya karena itu sama salahnya dengan memberi nilai 0. */
const NOT_APPLICABLE = (key: string, what: string, reason: string): Component => ({
  key, score: 0, availableMax: 0, declaredMax: 0, available: false,
  reason: `${what}: TIDAK BERLAKU (${reason})`,
});

/** Minimal 55% bobot harus punya data sebelum skor boleh diterjemahkan jadi kategori
 * BUY/SELL. Angka ini keputusan produk (didokumentasikan, bukan disembunyikan): di
 * bawah itu skor praktis cuma mencerminkan satu-dua dimensi. */
export const MIN_COVERAGE_PCT = 55;

// ==================== TECHNICAL (maks 40) ====================

function scoreMATrend(t: TechnicalInput): Component {
  const MAX = 15;
  if (t.currentPrice == null || t.ma20 == null || t.ma50 == null || t.ma200 == null) {
    return NA('ma_trend', MAX, 'Tren MA');
  }
  const p = t.currentPrice;
  if (p > t.ma20 && t.ma20 > t.ma50 && t.ma50 > t.ma200) {
    return { key: 'ma_trend', availableMax: MAX, declaredMax: MAX, available: true, score: 15, reason: `Uptrend sempurna P:${Math.round(p)} > MA20:${Math.round(t.ma20)} > MA50:${Math.round(t.ma50)} > MA200:${Math.round(t.ma200)}` };
  }
  if (p > t.ma20 && p > t.ma50) {
    return { key: 'ma_trend', availableMax: MAX, declaredMax: MAX, available: true, score: 10, reason: 'Harga di atas MA20 & MA50, tapi belum full uptrend' };
  }
  if (p > t.ma200) {
    return { key: 'ma_trend', availableMax: MAX, declaredMax: MAX, available: true, score: 5, reason: 'Harga di atas MA200 tapi di bawah MA20/MA50' };
  }
  if (p < t.ma20 && t.ma20 < t.ma50 && t.ma50 < t.ma200) {
    return { key: 'ma_trend', availableMax: MAX, declaredMax: MAX, available: true, score: 0, reason: 'Downtrend penuh P < MA20 < MA50 < MA200' };
  }
  return { key: 'ma_trend', availableMax: MAX, declaredMax: MAX, available: true, score: 3, reason: 'Sideways / tidak ada tren jelas' };
}

/** Klasifikasi tren kasar dari posisi harga terhadap MA50/MA200 - dipakai untuk
 * menafsirkan RSI sesuai rezimnya (P1-7). `null` kalau MA yang dibutuhkan tidak ada.
 *
 * Sengaja hanya tiga kelas dan hanya dari MA yang SUDAH dihitung di tempat lain: ini
 * penafsir konteks, bukan indikator baru yang perlu divalidasi sendiri. */
function trendRegime(t: TechnicalInput): 'UP' | 'DOWN' | 'SIDEWAYS' | null {
  const p = t.currentPrice;
  if (p == null || t.ma50 == null || t.ma200 == null) return null;
  if (p > t.ma50 && t.ma50 > t.ma200) return 'UP';
  if (p < t.ma50 && t.ma50 < t.ma200) return 'DOWN';
  return 'SIDEWAYS';
}

/**
 * RSI 14 - DITAFSIRKAN MENURUT REZIM TREN (temuan P1-7).
 *
 * Masalah yang diperbaiki: `rsi-analyzer.ts` menyatakan RSI < 40 sebagai BULLISH
 * ("oversold = peluang beli") sementara fungsi ini dulu memberinya 2 dari 8 poin dengan
 * alasan "OVERSOLD zona SELL/hati-hati". Untuk RSI 32, pengguna melihat kartu
 * "RSI 14: BULLISH (68%)" tepat di sebelah alasan skor yang mengatakan hati-hati - satu
 * sistem, satu halaman, dua kesimpulan berlawanan atas satu angka.
 *
 * Yang benar secara teknikal adalah keduanya, tergantung rezim:
 * - Dalam UPTREND, RSI rendah = koreksi sehat di dalam tren naik -> memang peluang.
 * - Dalam DOWNTREND, RSI rendah bukan sinyal beli - itu justru bukti tekanan jual yang
 *   masih berlangsung (pisau jatuh). "Oversold" bisa bertahan berbulan-bulan.
 *
 * Jadi angkanya sekarang dibaca bersama rezimnya, dan `rsi-analyzer.ts` disamakan
 * penafsirannya (lihat file itu) supaya tidak ada lagi dua kesimpulan berbeda.
 */
function scoreRsi(t: TechnicalInput): Component {
  const MAX = 8;
  if (t.rsi == null) return NA('rsi', MAX, 'RSI 14');
  const rsi = t.rsi;
  const regime = trendRegime(t);
  const mk = (score: number, reason: string): Component =>
    ({ key: 'rsi', availableMax: MAX, declaredMax: MAX, available: true, score, reason });

  // Overbought ekstrem berbahaya di rezim mana pun - satu-satunya pita yang tidak
  // bergantung konteks.
  if (rsi > 78) return mk(0, `RSI ${rsi.toFixed(1)} OVERBOUGHT ekstrem - risiko koreksi`);

  if (regime === 'DOWN') {
    // Dalam downtrend, momentum kuat justru yang bernilai (tanda pembalikan), dan RSI
    // rendah TIDAK diberi poin sebagai "murah".
    if (rsi >= 55) return mk(6, `RSI ${rsi.toFixed(1)} menguat di dalam downtrend - kemungkinan pembalikan`);
    if (rsi >= 45) return mk(3, `RSI ${rsi.toFixed(1)} netral di dalam downtrend`);
    if (rsi >= 30) return mk(1, `RSI ${rsi.toFixed(1)} lemah searah downtrend - oversold BUKAN sinyal beli di sini`);
    return mk(0, `RSI ${rsi.toFixed(1)} sangat lemah searah downtrend - tekanan jual masih berlangsung`);
  }

  if (regime === 'UP') {
    // Dalam uptrend, RSI 50-80 adalah kondisi normal tren sehat; RSI rendah = pullback,
    // yang secara historis justru titik masuk yang lebih baik daripada mengejar puncak.
    if (rsi >= 50 && rsi <= 78) return mk(8, `RSI ${rsi.toFixed(1)} sehat di dalam uptrend`);
    if (rsi >= 40 && rsi < 50) return mk(7, `RSI ${rsi.toFixed(1)} pullback di dalam uptrend - peluang masuk`);
    return mk(5, `RSI ${rsi.toFixed(1)} oversold di dalam uptrend - koreksi dalam, perlu konfirmasi`);
  }

  // SIDEWAYS atau rezim tidak diketahui (MA belum lengkap): pembacaan mean-reversion
  // klasik berlaku, tapi tanpa memberi nilai penuh ke ekstrem mana pun.
  if (rsi >= 50 && rsi <= 70) return mk(6, `RSI ${rsi.toFixed(1)} bias naik (sideways)`);
  if (rsi >= 40 && rsi < 50) return mk(4, `RSI ${rsi.toFixed(1)} netral (sideways)`);
  if (rsi > 70) return mk(2, `RSI ${rsi.toFixed(1)} mendekati overbought (sideways)`);
  return mk(3, `RSI ${rsi.toFixed(1)} oversold (sideways) - mean reversion mungkin, belum terkonfirmasi`);
}

function scoreMacd(t: TechnicalInput): Component {
  const MAX = 7;
  // Histogram = macdLine - macdSignal (lihat macd-analyzer.ts), jadi `macdHist > 0` dan
  // `macdLine > macdSignal` identik secara matematis - cukup satu yang diperiksa
  // (catatan temuan H-06 audit 2026-08-03 tetap berlaku).
  if (t.macdHist == null) return NA('macd', MAX, 'MACD');
  if (t.macdHist > 0) return { key: 'macd', availableMax: MAX, declaredMax: MAX, available: true, score: 7, reason: `MACD bullish (Hist:${t.macdHist.toFixed(2)})` };
  if (t.macdHist < 0) return { key: 'macd', availableMax: MAX, declaredMax: MAX, available: true, score: 0, reason: `MACD bearish (Hist:${t.macdHist.toFixed(2)})` };
  return { key: 'macd', availableMax: MAX, declaredMax: MAX, available: true, score: 3, reason: 'MACD netral (Hist:0.00)' };
}

/**
 * VOLUME - DIKONFIRMASI ARAH HARGA (temuan P1-8).
 *
 * Masalah yang diperbaiki: fungsi ini dulu memberi 10 dari 10 poin untuk setiap volume
 * >= 2x rata-rata, TANPA melihat harga bergerak ke mana. Saham yang anjlok -12% dengan
 * volume 3x rata-rata - yaitu panic selling / distribusi berat - mendapat nilai volume
 * SEMPURNA, persis sama dengan saham yang breakout naik dengan volume 3x.
 *
 * Volume adalah BESARAN (seberapa ramai), bukan ARAH. Memberi poin searah atas besaran
 * tanpa arah adalah kesalahan kategori yang sama dengan menilai ATR sebagai sinyal
 * bullish - kesalahan yang sudah diperbaiki di volatility-analyzer.ts tapi belum
 * diterapkan ke volume.
 *
 * Sekarang: volume tinggi MEMPERKUAT arah yang sedang terjadi, ke atas maupun ke bawah.
 * Kalau arah tidak diketahui (`changePct` tidak dipasok), volume tinggi diberi nilai
 * tengah dengan alasan yang menyatakan keterbatasannya - bukan nilai penuh.
 */
function scoreVolume(t: TechnicalInput): Component {
  const MAX = 10;
  if (!t.volToday || !t.volAvg20) return NA('volume', MAX, 'Volume');
  const ratio = t.volToday / t.volAvg20;
  const mk = (score: number, reason: string): Component =>
    ({ key: 'volume', availableMax: MAX, declaredMax: MAX, available: true, score, reason });

  const chg = t.changePct;
  const arahDiketahui = chg != null && Number.isFinite(chg);
  const rasio = `${ratio.toFixed(1)}x avg`;

  // Volume di bawah rata-rata: partisipasi tipis, tidak mengonfirmasi apa pun.
  if (ratio < 1.0) return mk(1, `Volume ${rasio} (RENDAH - pergerakan tidak terkonfirmasi partisipasi)`);
  if (ratio < 1.5) return mk(4, `Volume ${rasio} (NORMAL)`);

  if (!arahDiketahui) {
    // Ramai, tapi kita tidak tahu ramai ke arah mana. Nilai tengah, dinyatakan apa adanya.
    return mk(5, `Volume ${rasio} (TINGGI, arah harga tidak diketahui - tidak dinilai sebagai konfirmasi beli)`);
  }

  const naik = (chg as number) > 0.5;
  const turun = (chg as number) < -0.5;
  const chgLabel = `${(chg as number) >= 0 ? '+' : ''}${(chg as number).toFixed(1)}%`;

  if (ratio >= 2.0) {
    if (naik) return mk(10, `Volume ${rasio} SANGAT TINGGI mengonfirmasi kenaikan ${chgLabel}`);
    if (turun) return mk(0, `Volume ${rasio} SANGAT TINGGI menyertai penurunan ${chgLabel} - tekanan jual berat`);
    return mk(5, `Volume ${rasio} SANGAT TINGGI tapi harga nyaris datar ${chgLabel} - kemungkinan pergantian tangan`);
  }

  // ratio 1.5 - 2.0
  if (naik) return mk(8, `Volume ${rasio} mengonfirmasi kenaikan ${chgLabel}`);
  if (turun) return mk(1, `Volume ${rasio} menyertai penurunan ${chgLabel} - distribusi`);
  return mk(4, `Volume ${rasio} di atas rata-rata, harga datar ${chgLabel}`);
}

// ==================== FUNDAMENTAL (maks 30) ====================

/**
 * VALUASI - dinilai terhadap pengganda yang DIBENARKAN fundamental emiten itu sendiri,
 * bukan terhadap ambang tetap yang sama untuk seluruh IDX (temuan P1-10 & P1-12).
 *
 * Apa yang berubah dan kenapa:
 *
 * 1. PBV tidak lagi dinilai absolut ("< 1x = murah"). Pertanyaannya diganti menjadi
 *    "PBV ini di atas atau di bawah PBV yang dibenarkan ROE & risikonya?", dengan
 *    PBV* = (ROE - g)/(r - g) dan r = SBN10Y + beta x ERP.
 *
 *    Ini memperbaiki kesalahan yang paling sering dikeluhkan: bank ROE 21% di PBV 4x
 *    dulu dinilai "premium" (1 dari 5) sama seperti bank ROE 6% di PBV 1,2x - padahal
 *    yang kedua justru jauh lebih mahal relatif terhadap kemampuan menghasilkan labanya
 *    (PBV wajarnya cuma sekitar 0,15x). Sekarang keduanya dinilai terbalik, dan itu
 *    memang seharusnya begitu.
 *
 * 2. PER tidak lagi dinilai lewat pita tetap (< 10 murah, >= 25 mahal). Dinilai lewat
 *    earnings yield dibanding cost of equity emiten. Emiten konsumen primer & kesehatan
 *    yang secara struktural diperdagangkan 25-35x tidak lagi otomatis 0 dari 5, dan
 *    emiten berisiko tinggi tidak lagi dianggap murah hanya karena PER-nya rendah.
 *
 * 3. Penjaga puncak siklus. Emiten energi & barang baku dengan PER sangat rendah
 *    BERSAMAAN dengan ROE sangat tinggi adalah tanda tangan laba puncak siklus, bukan
 *    penemuan saham murah. Nilai valuasinya dibatasi, dengan alasan yang dinyatakan.
 *
 * 4. Kalau ROE tidak tersedia, PBV TIDAK dinilai (sub-faktor jadi tidak tersedia dan
 *    bobotnya direnormalisasi) - bukan jatuh balik ke ambang absolut yang salah.
 *    Mengakui tidak bisa menilai lebih baik daripada menilai dengan cara yang keliru.
 */
function scoreValuasi(f: FundamentalInput): Component {
  const MAX = 10;
  if (f.per === null && f.pbv === null) return NA('valuasi', MAX, 'Valuasi (PER/PBV)');

  const profile = resolveSectorProfile(f.sector?.yahooSector, f.sector?.yahooIndustry);
  const implied = impliedMultiples({
    roePct: f.roe,
    payoutRatio: f.sector?.payoutRatio ?? null,
    beta: f.sector?.beta ?? null,
    fallbackBeta: profile.defaultBeta,
  });

  // Sub-bobot: PER 5, PBV 5. `declaredMax` TETAP 10 supaya sub-faktor yang hilang
  // terlihat di coverage_pct (P0-2).
  let score = 0;
  let availableMax = 0;
  const parts: string[] = [];

  const verdict = (s: number): string =>
    s >= 5 ? 'diskon besar terhadap wajar'
      : s === 4 ? 'di bawah wajar'
        : s === 3 ? 'wajar'
          : s === 2 ? 'di atas wajar'
            : s === 1 ? 'premium terhadap wajar'
              : 'premium besar terhadap wajar';

  // --- PER: aktual vs PER yang dibenarkan model ---
  if (f.per !== null && f.per <= 0) {
    // Emiten rugi. Bukan "mahal" - PER negatif tidak punya makna valuasi sama sekali.
    // Diberi 1 dari 5 (bukan 0) karena kerugian ITU SENDIRI sudah dihukum penuh di
    // komponen profitabilitas; menghukumnya lagi di sini adalah hitung ganda.
    availableMax += 5;
    score += 1;
    parts.push(`PER ${f.per.toFixed(1)}x (emiten rugi - valuasi berbasis laba tidak bermakna)`);
  } else if (f.per !== null && implied.fairPer !== null) {
    const perScore = scoreMultipleRatio(implied.fairPer / f.per);
    if (perScore !== null) {
      availableMax += 5;
      score += perScore;
      const basis = implied.fairPerBasis === 'gordon'
        ? `ROE ${f.roe?.toFixed(1)}%, pertumbuhan ${implied.growthPct.toFixed(1)}%`
        : 'tanpa pertumbuhan - ROE tidak tersedia';
      parts.push(
        `PER ${f.per.toFixed(1)}x vs wajar ${implied.fairPer.toFixed(1)}x (${basis}, biaya ekuitas ${implied.costOfEquityPct.toFixed(1)}%) - ${verdict(perScore)}`
      );
    }
  }

  // --- PBV: aktual vs PBV yang dibenarkan ROE & risiko ---
  if (f.pbv !== null && f.pbv > 0 && implied.fairPbv !== null) {
    const pbvScore = scoreMultipleRatio(implied.fairPbv / f.pbv);
    if (pbvScore !== null) {
      availableMax += 5;
      score += pbvScore;
      parts.push(
        `PBV ${f.pbv.toFixed(2)}x vs wajar ${implied.fairPbv.toFixed(2)}x (ROE ${f.roe?.toFixed(1)}%, biaya ekuitas ${implied.costOfEquityPct.toFixed(1)}%) - ${verdict(pbvScore)}`
      );
    }
  } else if (f.pbv !== null && f.pbv > 0 && f.roe !== null && f.roe <= 0) {
    // ROE negatif/nol: modal sedang tergerus, jadi TIDAK ADA premi terhadap nilai buku
    // yang bisa dibenarkan pertumbuhan laba. Diberi 1 dari 5, bukan 0, dengan alasan
    // yang sama seperti PER emiten rugi di atas - kerugiannya sendiri sudah dihukum
    // penuh di komponen profitabilitas, dan menghukumnya dua kali adalah hitung ganda.
    availableMax += 5;
    score += 1;
    parts.push(`PBV ${f.pbv.toFixed(2)}x - ROE ${f.roe.toFixed(1)}% (modal tergerus, premi terhadap nilai buku tidak dibenarkan)`);
  } else if (f.pbv !== null && implied.fairPbv === null) {
    // ROE tidak ada -> PBV wajar tidak bisa dihitung -> jangan dinilai dengan ambang
    // absolut yang justru sumber temuan P1-10. Mengakui tidak bisa menilai lebih baik
    // daripada menilai dengan cara yang sudah terbukti keliru.
    parts.push(`PBV ${f.pbv.toFixed(2)}x - tidak dinilai (ROE tidak tersedia, PBV wajar tak terhitung)`);
  }

  if (availableMax === 0) return NA('valuasi', MAX, 'Valuasi (PER/PBV)');

  // --- Penjaga puncak siklus (P1-10) ---
  let caveat: string | undefined;
  if (isPeakCycleSignature(profile, f.per, f.roe)) {
    const capped = Math.min(score, availableMax * 0.4);
    caveat = `Pola laba puncak siklus (${profile.label}: PER ${f.per?.toFixed(1)}x + ROE ${f.roe?.toFixed(1)}%) - laba TTM kemungkinan tidak berkelanjutan, valuasi murahnya bisa menyesatkan`;
    if (capped < score) {
      score = capped;
      parts.push(`dibatasi karena pola puncak siklus`);
    }
  }

  return { key: 'valuasi', availableMax, declaredMax: MAX, available: true, score, reason: parts.join(', '), caveat };
}

function scoreProfitabilitas(f: FundamentalInput): Component {
  const MAX = 10;
  if (f.roe === null && f.revenueGrowth === null) return NA('profitabilitas', MAX, 'Profitabilitas (ROE/Growth)');

  let score = 0;
  let availableMax = 0;
  const parts: string[] = [];

  if (f.roe !== null) {
    availableMax += 5;
    if (f.roe > 20) { score += 5; parts.push(`ROE ${f.roe.toFixed(1)}% (sangat baik)`); }
    else if (f.roe >= 15) { score += 4; parts.push(`ROE ${f.roe.toFixed(1)}% (sehat)`); }
    else if (f.roe >= 8) { score += 2; parts.push(`ROE ${f.roe.toFixed(1)}% (cukup)`); }
    else { score += 0; parts.push(`ROE ${f.roe.toFixed(1)}% (lemah)`); }
  }
  if (f.revenueGrowth !== null) {
    availableMax += 5;
    if (f.revenueGrowth > 15) { score += 5; parts.push(`Rev Growth ${f.revenueGrowth.toFixed(0)}% (tinggi)`); }
    else if (f.revenueGrowth > 5) { score += 3; parts.push(`Rev Growth ${f.revenueGrowth.toFixed(0)}% (stabil)`); }
    else if (f.revenueGrowth > 0) { score += 1; parts.push(`Rev Growth ${f.revenueGrowth.toFixed(0)}% (lambat)`); }
    else { score += 0; parts.push(`Rev Growth ${f.revenueGrowth.toFixed(0)}% (negatif)`); }
  }
  return { key: 'profitabilitas', availableMax, declaredMax: MAX, available: true, score, reason: parts.join(', ') };
}

/**
 * KESEHATAN NERACA - ambang DER mengikuti struktur pendanaan normal sektornya, dan
 * DER/Current Ratio dinyatakan TIDAK BERLAKU untuk lembaga keuangan (temuan P1-11).
 *
 * Dua kesalahan yang diperbaiki:
 *
 * 1. Bank & multifinance dulu mendapat 0 dari 5 untuk DER karena DER "sehat" mereka
 *    memang 5-8x menurut model bisnisnya (menghimpun dana lalu menyalurkannya). Lebih
 *    buruk lagi: kalau Yahoo kebetulan TIDAK mengembalikan DER, komponennya di-NA-kan
 *    sehingga bank yang datanya HILANG dinilai lebih baik daripada bank yang datanya
 *    LENGKAP. Penilaian yang berbalik arah karena ketersediaan data adalah cacat, bukan
 *    perbedaan pendapat. Sekarang: TIDAK BERLAKU, bobotnya direnormalisasi, dan
 *    coverage_pct tidak ikut turun (lihat NOT_APPLICABLE).
 *
 * 2. Properti, konstruksi, dan infrastruktur dulu dinilai dengan ambang yang sama
 *    dengan emiten konsumen. DER 1,5-2,5x adalah norma industri mereka, bukan tanda
 *    bahaya. Batas per sektor ada di modules/sector.
 */
function scoreKesehatan(f: FundamentalInput): Component {
  const MAX = 10;
  const profile = resolveSectorProfile(f.sector?.yahooSector, f.sector?.yahooIndustry);

  // Lembaga keuangan: kedua metrik memang tidak berlaku - bukan datanya yang kurang.
  if (!profile.derApplicable && !profile.currentRatioApplicable) {
    return NOT_APPLICABLE(
      'kesehatan',
      'Kesehatan neraca (DER/CR)',
      `${profile.label} - leverage adalah model bisnisnya, DER & Current Ratio tidak sebanding dengan emiten non-keuangan`
    );
  }

  if (f.der === null && f.currentRatio === null) return NA('kesehatan', MAX, 'Kesehatan neraca (DER/CR)');

  let score = 0;
  let availableMax = 0;
  const parts: string[] = [];

  if (profile.derApplicable && f.der !== null) {
    const [konservatif, sehat, agakTinggi] = profile.derBands;
    availableMax += 5;
    if (f.der < konservatif) { score += 5; parts.push(`DER ${f.der.toFixed(2)}x (konservatif untuk ${profile.label})`); }
    else if (f.der < sehat) { score += 4; parts.push(`DER ${f.der.toFixed(2)}x (sehat untuk ${profile.label})`); }
    else if (f.der < agakTinggi) { score += 2; parts.push(`DER ${f.der.toFixed(2)}x (agak tinggi untuk ${profile.label})`); }
    else { score += 0; parts.push(`DER ${f.der.toFixed(2)}x (berisiko tinggi untuk ${profile.label})`); }
  }

  if (profile.currentRatioApplicable && f.currentRatio !== null) {
    availableMax += 5;
    if (f.currentRatio > 2.0) { score += 5; parts.push(`CR ${f.currentRatio.toFixed(2)}x (sangat likuid)`); }
    else if (f.currentRatio >= 1.5) { score += 4; parts.push(`CR ${f.currentRatio.toFixed(2)}x (sehat)`); }
    else if (f.currentRatio >= 1.0) { score += 2; parts.push(`CR ${f.currentRatio.toFixed(2)}x (cukup)`); }
    else { score += 0; parts.push(`CR ${f.currentRatio.toFixed(2)}x (risiko likuiditas)`); }
  }

  if (availableMax === 0) return NA('kesehatan', MAX, 'Kesehatan neraca (DER/CR)');

  // Sub-faktor yang tidak berlaku untuk sektor ini tidak boleh ikut jadi penyebut -
  // itu sebabnya `declaredMax` di sini dihitung dari yang BERLAKU, bukan tetap 10.
  const declaredMax =
    (profile.derApplicable ? 5 : 0) + (profile.currentRatioApplicable ? 5 : 0);

  return { key: 'kesehatan', availableMax, declaredMax, available: true, score, reason: parts.join(', ') };
}

// ==================== FLOW / ARUS DANA (maks 30) ====================
//
// SATU sumber (Chaikin Money Flow dari harga+volume), DUA sifat berbeda yang masing-
// masing dinilai sekali:
//   1. BESARAN tekanan beli/jual saat ini  -> scoreFlowTekanan (maks 20)
//   2. PERSISTENSI tekanan itu dari waktu ke waktu -> scoreFlowPersistensi (maks 10)
// Ini menggantikan pasangan scoreAsing()/scoreBandar() lama yang menyekor kuantitas yang
// sama dua kali (temuan H-1).
//
// Catatan penting yang TIDAK boleh hilang: ini PROXY dari harga+volume Yahoo Finance,
// BUKAN data transaksi broker/asing (IDX tidak menyediakan feed itu gratis). Karena itu
// alasan yang dihasilkan di bawah memakai istilah "arus dana"/"tekanan beli", bukan
// "asing net buy" yang menyiratkan data broker sungguhan.

function scoreFlowTekanan(flow: FlowInput): Component {
  const MAX = 20;
  if (flow.cmf20 == null) return NA('flow_tekanan', MAX, 'Arus dana (CMF20)');
  const cmf = flow.cmf20;
  if (cmf > 20) return { key: 'flow_tekanan', availableMax: MAX, declaredMax: MAX, available: true, score: 20, reason: `CMF20 +${cmf.toFixed(1)}% - tekanan beli kuat` };
  if (cmf > 5) return { key: 'flow_tekanan', availableMax: MAX, declaredMax: MAX, available: true, score: 14, reason: `CMF20 +${cmf.toFixed(1)}% - tekanan beli moderat` };
  if (cmf >= -5) return { key: 'flow_tekanan', availableMax: MAX, declaredMax: MAX, available: true, score: 8, reason: `CMF20 ${cmf.toFixed(1)}% - arus dana seimbang` };
  if (cmf >= -20) return { key: 'flow_tekanan', availableMax: MAX, declaredMax: MAX, available: true, score: 3, reason: `CMF20 ${cmf.toFixed(1)}% - tekanan jual moderat` };
  return { key: 'flow_tekanan', availableMax: MAX, declaredMax: MAX, available: true, score: 0, reason: `CMF20 ${cmf.toFixed(1)}% - tekanan jual kuat` };
}

/**
 * PERSISTENSI ARUS DANA - diukur atas JENDELA 20 hari, bukan dari panjang streak
 * berturut-turut (temuan P1-9).
 *
 * Kenapa streak salah untuk mengukur persistensi: streak putus total begitu ada SATU
 * hari berlawanan. Saham yang 18 dari 20 hari terakhir mengalami tekanan beli, tapi
 * kebetulan hari terakhirnya merah, punya streak 0 - dan dulu dinilai sama dengan saham
 * yang memang tidak punya arus dana searah sama sekali. Itu mengukur "hari terakhir",
 * bukan "persistensi".
 *
 * Ukuran yang dipakai sekarang: `mfmPositiveRatio20` = proporsi hari dengan Money Flow
 * Multiplier positif dalam 20 hari. Stabil dari hari ke hari, dan tetap turun kalau
 * tekanannya memang benar-benar berbalik.
 *
 * `consecutiveBuyDays`/`consecutiveSellDays` tetap diterima dan tetap ditampilkan
 * sebagai konteks di alasan - streak bukan angka yang salah, ia hanya bukan ukuran
 * persistensi. Kalau proporsi 20 hari tidak tersedia (histori < 20 bar), penilaian
 * jatuh balik ke streak dengan alasan yang menyatakan keterbatasannya.
 */
function scoreFlowPersistensi(flow: FlowInput): Component {
  const MAX = 10;
  if (flow.accumulationStatus == null) return NA('flow_persistensi', MAX, 'Persistensi arus dana');

  const mk = (score: number, reason: string): Component =>
    ({ key: 'flow_persistensi', availableMax: MAX, declaredMax: MAX, available: true, score, reason });

  const buy = flow.consecutiveBuyDays;
  const sell = flow.consecutiveSellDays;
  const ratio = flow.mfmPositiveRatio20;

  if (ratio != null) {
    const pct = (ratio * 100).toFixed(0);
    // Dinilai dari proporsi jendela; status akumulasi/distribusi dipakai sebagai
    // penguat arah, bukan sebagai penentu tunggal.
    if (ratio >= 0.65) {
      return mk(
        flow.accumulationStatus === 'AKUMULASI' ? 10 : 8,
        `Tekanan beli persisten: ${pct}% dari 20 hari terakhir arus dana positif (streak berjalan ${buy} hari)`
      );
    }
    if (ratio >= 0.55) return mk(7, `Tekanan beli condong positif: ${pct}% dari 20 hari terakhir (streak ${buy} hari)`);
    if (ratio >= 0.45) return mk(5, `Arus dana berimbang: ${pct}% dari 20 hari terakhir positif`);
    if (ratio >= 0.35) return mk(3, `Tekanan jual condong dominan: hanya ${pct}% dari 20 hari terakhir positif`);
    return mk(
      flow.accumulationStatus === 'DISTRIBUSI' ? 0 : 1,
      `Tekanan jual persisten: hanya ${pct}% dari 20 hari terakhir arus dana positif (streak jual ${sell} hari)`
    );
  }

  // Histori < 20 bar - proporsi jendela belum bisa dihitung.
  if (flow.accumulationStatus === 'AKUMULASI') {
    return mk(7, `Akumulasi terkonfirmasi (${buy} hari berturut) - jendela 20 hari belum penuh, persistensi belum terukur`);
  }
  if (flow.accumulationStatus === 'DISTRIBUSI') {
    return mk(2, `Distribusi terkonfirmasi (${sell} hari berturut) - jendela 20 hari belum penuh, persistensi belum terukur`);
  }
  return mk(5, 'Belum ada arus dana yang konsisten searah');
}

// ==================== PENGGABUNGAN ====================

/** Jumlahkan komponen yang datanya ADA saja, lalu skala ke `groupMax`.
 *
 * Dua hal berbeda yang dulu tercampur jadi satu (P0-2):
 * - SKOR direnormalisasi atas bobot yang tersedia (`rawMax`), sehingga ketiadaan data
 *   tidak diam-diam berubah jadi nilai nol yang menghukum. Ini perilaku LAMA, dipertahankan.
 * - KELENGKAPAN (`availableMax` yang dikembalikan) diukur terhadap bobot yang
 *   DIDEKLARASIKAN (`declaredTotal`, konstan). Ini yang diperbaiki: dulu penyebutnya
 *   ikut menyusut bersama pembilang, sehingga kehilangan sub-faktor tidak pernah terlihat. */
function combine(components: Component[], groupMax: number): { score: number; availableMax: number } {
  const available = components.filter((c) => c.available && c.availableMax > 0);
  const rawMax = available.reduce((s, c) => s + c.availableMax, 0);
  if (rawMax === 0) return { score: 0, availableMax: 0 };
  const raw = available.reduce((s, c) => s + c.score, 0);
  // BUG FIX P0-2: penyebut dari `declaredMax` SELURUH komponen (konstan), bukan dari
  // `max` yang tadinya bisa ikut menyusut bersama pembilangnya. Contoh emiten rugi
  // (PER null, PBV ada; ROE+growth ada; DER+CR ada): rawMax 25, declaredTotal 30 ->
  // availableMax 25 dari 30 -> coverage fundamental 83%, bukan 100% seperti dulu.
  const declaredTotal = components.reduce((s, c) => s + c.declaredMax, 0);
  const availableMax = (rawMax / declaredTotal) * groupMax;
  return { score: (raw / rawMax) * availableMax, availableMax };
}

function getKategori(total: number, coveragePct: number): ScoringKategori {
  if (coveragePct < MIN_COVERAGE_PCT) return 'DATA TIDAK CUKUP';
  if (total > SCORING_KATEGORI_THRESHOLDS.STRONG_BUY) return 'STRONG BUY';
  if (total >= SCORING_KATEGORI_THRESHOLDS.BUY) return 'BUY';
  if (total >= SCORING_KATEGORI_THRESHOLDS.HOLD) return 'HOLD';
  return 'SELL';
}

export function calculateScore(
  simbol: string,
  technical: TechnicalInput,
  fundamental: FundamentalInput,
  flow: FlowInput
): ScoringResult {
  const maTrend = scoreMATrend(technical);
  const rsi = scoreRsi(technical);
  const macd = scoreMacd(technical);
  const volume = scoreVolume(technical);
  const technicalGroup = combine([maTrend, rsi, macd, volume], 40);

  const valuasi = scoreValuasi(fundamental);
  const profitabilitas = scoreProfitabilitas(fundamental);
  const kesehatan = scoreKesehatan(fundamental);
  const fundamentalGroup = combine([valuasi, profitabilitas, kesehatan], 30);

  const flowTekanan = scoreFlowTekanan(flow);
  const flowPersistensi = scoreFlowPersistensi(flow);
  const flowGroup = combine([flowTekanan, flowPersistensi], 30);

  const allComponents = [maTrend, rsi, macd, volume, valuasi, profitabilitas, kesehatan, flowTekanan, flowPersistensi];
  const availableMaxTotal = technicalGroup.availableMax + fundamentalGroup.availableMax + flowGroup.availableMax;
  // Penyebut = jumlah bobot kelompok yang DIDEKLARASIKAN (40 + 30 + 30), konstan.
  // Ditulis sebagai konstanta bernama supaya hubungannya dengan groupMax di atas
  // eksplisit, bukan angka 100 yang kebetulan cocok (P0-2).
  const DECLARED_TOTAL_WEIGHT = 100;
  const coveragePct = Math.round((availableMaxTotal / DECLARED_TOTAL_WEIGHT) * 100);

  // Skor akhir diskalakan ke 0-100 atas bobot yang BENAR-BENAR punya data. Tanpa ini,
  // saham yang datanya cuma separuh otomatis maksimal 50 - bukan karena buruk, tapi
  // karena datanya kurang (temuan H-14).
  const totalScore = availableMaxTotal > 0
    ? Math.round(((technicalGroup.score + fundamentalGroup.score + flowGroup.score) / availableMaxTotal) * 100)
    : 0;

  const kategori = getKategori(totalScore, coveragePct);

  // `declaredMax === 0` menandai komponen yang TIDAK BERLAKU untuk sektor emiten ini,
  // bukan yang datanya hilang. Dipisah supaya bank tidak selalu terlihat "datanya
  // kurang" hanya karena DER/Current Ratio memang tidak relevan untuknya.
  const missing = allComponents.filter((c) => !c.available && c.declaredMax > 0).map((c) => c.reason);
  const notApplicable = allComponents.filter((c) => !c.available && c.declaredMax === 0).map((c) => c.reason);

  // 3 alasan teratas dari komponen yang ADA datanya, diurut kontribusi relatif
  // (skor/max), bukan skor mentah - supaya komponen bernilai maksimum 7 tidak selalu
  // kalah dari komponen bermaksimum 20 hanya karena skalanya lebih besar.
  const alasan3 = allComponents
    .filter((c) => c.available && c.availableMax > 0 && c.reason)
    .sort((a, b) => (b.score / b.availableMax) - (a.score / a.availableMax))
    .slice(0, 3)
    .map((c) => c.reason);

  let risk = '';
  if (technical.ma20 != null && technical.currentPrice != null && technical.currentPrice > 0) {
    const supportDist = ((technical.currentPrice - technical.ma20) / technical.currentPrice) * 100;
    risk = `Support MA20 di ${Math.round(technical.ma20)} (${supportDist > 0 ? '-' : '+'}${Math.abs(supportDist).toFixed(1)}%)`;
  }
  if (technical.rsi != null && technical.rsi > 78) {
    risk += ` | OVERBOUGHT RSI ${technical.rsi.toFixed(1)}`;
  }
  // Peringatan metodologis dari komponen mana pun WAJIB ikut terbawa - kalau tidak,
  // syarat yang membatasi kesimpulan tidak pernah sampai ke pembacanya.
  for (const c of allComponents) {
    if (c.caveat) risk += `${risk ? ' | ' : ''}${c.caveat}`;
  }
  if (coveragePct < 100) {
    risk += `${risk ? ' | ' : ''}Kelengkapan data ${coveragePct}%`;
  }

  const pick = (c: Component) => (c.available ? Math.round(c.score) : null);

  return {
    simbol,
    harga: technical.currentPrice,
    technical_score: Math.round(technicalGroup.score),
    fundamental_score: Math.round(fundamentalGroup.score),
    flow_score: Math.round(flowGroup.score),
    total_score: totalScore,
    coverage_pct: coveragePct,
    kategori,
    detail: {
      ma_trend: pick(maTrend),
      rsi: pick(rsi),
      macd: pick(macd),
      volume: pick(volume),
      valuasi: pick(valuasi),
      profitabilitas: pick(profitabilitas),
      kesehatan: pick(kesehatan),
      flow_tekanan: pick(flowTekanan),
      flow_persistensi: pick(flowPersistensi),
    },
    missing,
    not_applicable: notApplicable,
    alasan_3_poin: alasan3,
    risk,
  };
}
