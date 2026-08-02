// Proxy arus dana harian dari data harga+volume Yahoo Finance yang SUDAH real (BUKAN
// data broker/asing resmi - IDX tidak menyediakan feed broker summary gratis). Dipakai
// bersama oleh /api/flow/[ticker] (Bandar & Foreign Flow), app/api/stock/[ticker]
// (Foreign Flow analyzer), market-summary.service.ts (kategori "Akumulasi Asing" di AI
// Pick), dan screener.service.ts (kolom Bandarmology) - satu definisi, bukan beberapa
// logika berbeda yang bisa saling tidak konsisten.
//
// REWRITE (2026-08-03): sebelumnya netValueBillion cuma biner - hari close naik = FULL
// nilai transaksi dihitung "beli", hari turun = FULL nilai transaksi dihitung "jual",
// tidak peduli naik/turunnya tipis atau tajam. Diganti Chaikin Money Flow (CLV/MFM/CMF),
// indikator baku (Marc Chaikin) yang pakai posisi close di DALAM range High-Low harian -
// proporsional, bukan tebak arah dari close-to-close doang. Tetap proxy dari harga+volume
// (bukan data broker), tapi jauh lebih akurat merepresentasikan tekanan beli/jual harian.

export type DailyFlowPoint = { date: string; netValueBillion: number };
type OhlcvPoint = { date: string; high: number; low: number; close: number; volume: number };

/** Posisi close di dalam range High-Low hari itu: 1 = close di HIGH (tekanan beli
 * penuh), 0 = close di LOW (tekanan jual penuh), 0.5 = di tengah/range datar. */
function closeLocationValue(high: number, low: number, close: number): number {
  const range = high - low;
  if (range <= 0) return 0.5;
  return (close - low) / range;
}

/** Money Flow Multiplier - versi Chaikin dari CLV, range -1 (jual penuh) s/d +1
 * (beli penuh). MFM = 2*CLV - 1, ditulis eksplisit sesuai definisi bakunya. */
function moneyFlowMultiplier(high: number, low: number, close: number): number {
  const range = high - low;
  if (range <= 0) return 0;
  return ((close - low) - (high - close)) / range;
}

/** Net flow harian - dulu biner (±nilai transaksi penuh berdasar arah close),
 * sekarang MFM x nilai transaksi (proporsional ke posisi close dalam range harian). */
export function computeDailyNetFlow(history: OhlcvPoint[]): DailyFlowPoint[] {
  return history.map((h) => {
    const mfm = moneyFlowMultiplier(h.high, h.low, h.close);
    const valueBillion = (mfm * h.volume * h.close) / 1_000_000_000;
    return { date: h.date, netValueBillion: parseFloat(valueBillion.toFixed(2)) };
  });
}

/** Jumlah hari berturut-turut (dari yang paling baru mundur ke belakang) netValue
 * positif - "akumulasi berkelanjutan". 0 kalau hari terakhir sudah negatif/nol. */
export function computeAccumulationStreak(daily: DailyFlowPoint[]): number {
  let streak = 0;
  for (let i = daily.length - 1; i >= 0; i--) {
    if (daily[i].netValueBillion > 0) streak++;
    else break;
  }
  return streak;
}

export type BandarmologyStatus = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export interface BandarmologyResult {
  status: BandarmologyStatus;
  cmf20: number;
  clv: number;
  netPressurePct: number;
}

/** Chaikin Money Flow 20 hari - rata-rata MFM dibobot volume, persen -100 s/d +100.
 * Beda dari netValueBillion (yang sudah dikali harga jadi "nilai Rupiah"): CMF murni
 * rasio volume, jadi bisa dibandingkan antar saham beda harga/market cap. */
function chaikinMoneyFlow20(history: OhlcvPoint[]): number {
  const window = history.slice(-20);
  if (window.length === 0) return 0;
  let mfvSum = 0;
  let volSum = 0;
  for (const h of window) {
    mfvSum += moneyFlowMultiplier(h.high, h.low, h.close) * h.volume;
    volSum += h.volume;
  }
  return volSum > 0 ? (mfvSum / volSum) * 100 : 0;
}

/** Klasifikasi BULLISH/BEARISH/NEUTRAL dari CMF 20 hari + CLV hari terakhir. Ambang
 * 20/-20 untuk CMF dan 0.6/0.4 untuk CLV adalah standar industri (indikator Chaikin). */
export function analyzeBandarmology(history: OhlcvPoint[]): BandarmologyResult {
  if (history.length === 0) {
    return { status: 'NEUTRAL', cmf20: 0, clv: 0.5, netPressurePct: 0 };
  }
  const last = history[history.length - 1];
  const clv = closeLocationValue(last.high, last.low, last.close);
  const cmf20 = chaikinMoneyFlow20(history);
  const netPressurePct = (2 * clv - 1) * 100;

  let status: BandarmologyStatus = 'NEUTRAL';
  if (cmf20 > 20 && clv > 0.6) status = 'BULLISH';
  else if (cmf20 < -20 && clv < 0.4) status = 'BEARISH';

  return {
    status,
    cmf20: parseFloat(cmf20.toFixed(1)),
    clv: parseFloat(clv.toFixed(2)),
    netPressurePct: parseFloat(netPressurePct.toFixed(1)),
  };
}

export type AccumulationStatus = 'AKUMULASI' | 'DISTRIBUSI' | 'NETRAL';
export interface AccumulationSignal {
  status: AccumulationStatus;
  /** true kalau lolos SEMUA 4 syarat (bukan cuma 1) - dipakai gantikan cek lama
   * "3 hari netValue positif berturut-turut" yang gampang lolos meski sinyalnya lemah. */
  confirmed: boolean;
  cmf20: number;
  avgMfm3D: number;
  volRatio: number;
}

/** Konfirmasi akumulasi/distribusi 4-lapis - lebih ketat dari analyzeBandarmology()
 * (yang cuma 2 syarat: CMF20 + CLV hari terakhir). Dipakai untuk klaim yang lebih kuat
 * ("tekanan beli KONSISTEN", "akumulasi berkelanjutan"), bukan pengganti Bandarmology.
 * Harus lolos SEMUA: (1) CMF20 > 15%/< -15%, (2) 3 hari terakhir MFM & CLV searah kuat
 * (CLV > 0.6/< 0.4, bukan cuma > 0), (3) volume hari ini > 1.5x rata-rata 20 hari
 * (konfirmasi partisipasi nyata, bukan harga naik di volume sepi), (4) jumlah MFM 3 hari
 * terakhir menguat searah (> 0.5/< -0.5). */
export function analyzeAccumulationSignal(history: OhlcvPoint[]): AccumulationSignal {
  if (history.length < 3) {
    return { status: 'NETRAL', confirmed: false, cmf20: 0, avgMfm3D: 0, volRatio: 1 };
  }
  const window20 = history.slice(-20);
  const cmf20 = chaikinMoneyFlow20(history);
  const last3 = window20.slice(-3);
  const avgVol20 = window20.reduce((s, h) => s + h.volume, 0) / window20.length;
  const lastDay = history[history.length - 1];
  const volRatio = avgVol20 > 0 ? lastDay.volume / avgVol20 : 1;
  const mfmSum3D = last3.reduce((s, h) => s + moneyFlowMultiplier(h.high, h.low, h.close), 0);
  const volConfirmed = volRatio > 1.5;

  const bullish = [
    cmf20 > 15,
    last3.every((h) => moneyFlowMultiplier(h.high, h.low, h.close) > 0 && closeLocationValue(h.high, h.low, h.close) > 0.6),
    volConfirmed,
    mfmSum3D > 0.5,
  ].every(Boolean);

  const bearish = [
    cmf20 < -15,
    last3.every((h) => moneyFlowMultiplier(h.high, h.low, h.close) < 0 && closeLocationValue(h.high, h.low, h.close) < 0.4),
    volConfirmed,
    mfmSum3D < -0.5,
  ].every(Boolean);

  let status: AccumulationStatus = 'NETRAL';
  if (bullish) status = 'AKUMULASI';
  else if (bearish) status = 'DISTRIBUSI';

  return {
    status,
    confirmed: bullish || bearish,
    cmf20: parseFloat(cmf20.toFixed(1)),
    avgMfm3D: parseFloat((mfmSum3D / 3).toFixed(2)),
    volRatio: parseFloat(volRatio.toFixed(2)),
  };
}
