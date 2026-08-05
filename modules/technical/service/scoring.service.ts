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
}

export interface FundamentalInput {
  per: number | null;
  pbv: number | null;
  roe: number | null;  // persen (mis. 18.2)
  der: number | null;  // rasio (mis. 0.4)
  currentRatio: number | null;
  revenueGrowth: number | null; // yoy persen
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
  alasan_3_poin: string[];
  risk: string;
}

const NA = (key: string, declaredMax: number, what: string): Component => ({
  key, score: 0, availableMax: 0, declaredMax, available: false,
  reason: `${what}: DATA TIDAK TERSEDIA`,
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

/** RSI dipisah dari MACD (dulu satu fungsi `scoreRsiMacd`) supaya salah satu yang hilang
 * tidak menyeret yang lain ikut hilang - dan supaya bobotnya bisa dinormalisasi
 * per-indikator, bukan per-pasangan. */
function scoreRsi(t: TechnicalInput): Component {
  const MAX = 8;
  if (t.rsi == null) return NA('rsi', MAX, 'RSI 14');
  const rsi = t.rsi;
  if (rsi >= 50 && rsi <= 70) return { key: 'rsi', availableMax: MAX, declaredMax: MAX, available: true, score: 8, reason: `RSI ${rsi.toFixed(1)} zona BUY ideal` };
  if (rsi >= 40 && rsi < 50) return { key: 'rsi', availableMax: MAX, declaredMax: MAX, available: true, score: 4, reason: `RSI ${rsi.toFixed(1)} netral-lemah` };
  if (rsi > 70 && rsi <= 78) return { key: 'rsi', availableMax: MAX, declaredMax: MAX, available: true, score: 5, reason: `RSI ${rsi.toFixed(1)} mendekati overbought` };
  if (rsi > 78) return { key: 'rsi', availableMax: MAX, declaredMax: MAX, available: true, score: 0, reason: `RSI ${rsi.toFixed(1)} OVERBOUGHT zona SELL` };
  return { key: 'rsi', availableMax: MAX, declaredMax: MAX, available: true, score: 2, reason: `RSI ${rsi.toFixed(1)} OVERSOLD zona SELL/hati-hati` };
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

function scoreVolume(t: TechnicalInput): Component {
  const MAX = 10;
  if (!t.volToday || !t.volAvg20) return NA('volume', MAX, 'Volume');
  const ratio = t.volToday / t.volAvg20;
  if (ratio >= 2.0) return { key: 'volume', availableMax: MAX, declaredMax: MAX, available: true, score: 10, reason: `Volume ${ratio.toFixed(1)}x avg (SANGAT TINGGI)` };
  if (ratio >= 1.5) return { key: 'volume', availableMax: MAX, declaredMax: MAX, available: true, score: 8, reason: `Volume ${ratio.toFixed(1)}x avg (VALID)` };
  if (ratio >= 1.0) return { key: 'volume', availableMax: MAX, declaredMax: MAX, available: true, score: 4, reason: `Volume ${ratio.toFixed(1)}x avg (NORMAL)` };
  return { key: 'volume', availableMax: MAX, declaredMax: MAX, available: true, score: 1, reason: `Volume ${ratio.toFixed(1)}x avg (RENDAH)` };
}

// ==================== FUNDAMENTAL (maks 30) ====================

function scoreValuasi(f: FundamentalInput): Component {
  const MAX = 10;
  if (f.per === null && f.pbv === null) return NA('valuasi', MAX, 'Valuasi (PER/PBV)');

  // Sub-bobot: PER 5, PBV 5. Kalau salah satu tidak ada, `availableMax` ikut menyusut
  // supaya rasio skornya tetap adil (emiten rugi tanpa PER tidak dihukum, cuma dinilai
  // dari PBV) - TAPI `declaredMax` TETAP 10, supaya sub-faktor yang hilang tetap
  // terlihat di coverage_pct (P0-2; dulu keduanya satu field dan hilangnya tak terlihat).
  let score = 0;
  let availableMax = 0;
  const parts: string[] = [];

  if (f.per !== null) {
    availableMax += 5;
    if (f.per > 0 && f.per < 10) { score += 5; parts.push(`PER ${f.per.toFixed(1)}x (murah)`); }
    else if (f.per >= 10 && f.per < 15) { score += 4; parts.push(`PER ${f.per.toFixed(1)}x (wajar)`); }
    else if (f.per >= 15 && f.per < 25) { score += 2; parts.push(`PER ${f.per.toFixed(1)}x (agak mahal)`); }
    else if (f.per >= 25) { score += 0; parts.push(`PER ${f.per.toFixed(1)}x (mahal)`); }
    else { score += 1; parts.push(`PER ${f.per.toFixed(1)}x (negatif/rugi)`); }
  }
  if (f.pbv !== null) {
    availableMax += 5;
    if (f.pbv < 1) { score += 5; parts.push(`PBV ${f.pbv.toFixed(2)}x (di bawah book)`); }
    else if (f.pbv < 2) { score += 3; parts.push(`PBV ${f.pbv.toFixed(2)}x (wajar)`); }
    else { score += 1; parts.push(`PBV ${f.pbv.toFixed(2)}x (premium)`); }
  }
  return { key: 'valuasi', availableMax, declaredMax: MAX, available: true, score, reason: parts.join(', ') };
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

function scoreKesehatan(f: FundamentalInput): Component {
  const MAX = 10;
  // Bank & lembaga keuangan sering tidak punya DER/Current Ratio di Yahoo - dulu itu
  // membuat mereka kehilangan 10 poin penuh tanpa alasan fundamental (temuan H-14).
  if (f.der === null && f.currentRatio === null) return NA('kesehatan', MAX, 'Kesehatan neraca (DER/CR)');

  let score = 0;
  let availableMax = 0;
  const parts: string[] = [];

  if (f.der !== null) {
    availableMax += 5;
    if (f.der < 0.5) { score += 5; parts.push(`DER ${f.der.toFixed(2)}x (konservatif)`); }
    else if (f.der < 1.0) { score += 4; parts.push(`DER ${f.der.toFixed(2)}x (sehat)`); }
    else if (f.der < 2.0) { score += 2; parts.push(`DER ${f.der.toFixed(2)}x (agak tinggi)`); }
    else { score += 0; parts.push(`DER ${f.der.toFixed(2)}x (berisiko tinggi)`); }
  }
  if (f.currentRatio !== null) {
    availableMax += 5;
    if (f.currentRatio > 2.0) { score += 5; parts.push(`CR ${f.currentRatio.toFixed(2)}x (sangat likuid)`); }
    else if (f.currentRatio >= 1.5) { score += 4; parts.push(`CR ${f.currentRatio.toFixed(2)}x (sehat)`); }
    else if (f.currentRatio >= 1.0) { score += 2; parts.push(`CR ${f.currentRatio.toFixed(2)}x (cukup)`); }
    else { score += 0; parts.push(`CR ${f.currentRatio.toFixed(2)}x (risiko likuiditas)`); }
  }
  return { key: 'kesehatan', availableMax, declaredMax: MAX, available: true, score, reason: parts.join(', ') };
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

function scoreFlowPersistensi(flow: FlowInput): Component {
  const MAX = 10;
  if (flow.accumulationStatus == null) return NA('flow_persistensi', MAX, 'Persistensi arus dana');

  const buy = flow.consecutiveBuyDays;
  const sell = flow.consecutiveSellDays;
  if (flow.accumulationStatus === 'AKUMULASI') {
    // Konfirmasi 4-lapis SUDAH lolos (CMF20 + CLV 3 hari + volume spike + tren MFM) -
    // yang dinilai di sini murni PANJANG streak-nya, sifat yang belum dinilai di manapun.
    if (buy >= 4) return { key: 'flow_persistensi', availableMax: MAX, declaredMax: MAX, available: true, score: 10, reason: `Akumulasi terkonfirmasi ${buy} hari berturut` };
    return { key: 'flow_persistensi', availableMax: MAX, declaredMax: MAX, available: true, score: 7, reason: `Akumulasi terkonfirmasi (${buy} hari berturut)` };
  }
  if (flow.accumulationStatus === 'DISTRIBUSI') {
    if (sell >= 4) return { key: 'flow_persistensi', availableMax: MAX, declaredMax: MAX, available: true, score: 0, reason: `Distribusi terkonfirmasi ${sell} hari berturut` };
    return { key: 'flow_persistensi', availableMax: MAX, declaredMax: MAX, available: true, score: 2, reason: `Distribusi terkonfirmasi (${sell} hari berturut)` };
  }
  return { key: 'flow_persistensi', availableMax: MAX, declaredMax: MAX, available: true, score: 5, reason: 'Belum ada arus dana yang konsisten searah' };
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

  const missing = allComponents.filter((c) => !c.available).map((c) => c.reason);

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
    alasan_3_poin: alasan3,
    risk,
  };
}
