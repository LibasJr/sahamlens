import { findStructuralZones, type SwingBar, type StructuralLevel } from '../../technical/service/analyzers/swing-levels';

export const MIN_LONG_RR = 1.5;
export const MIN_CONFIRMED_LEVEL_TOUCHES = 2;

export type SupportQuality = 'CONFIRMED' | 'WEAK' | 'NONE';

export interface LongTradingSetup {
  entry: number;
  /** Stop utama berbasis support struktural terkonfirmasi + buffer ATR, atau fallback ATR. */
  stop: number;
  /** Target pertama. Minimal 1.5R; default 2R kalau tidak ada resistance sebelum target. */
  tp1: number;
  /** Target lanjutan: resistance struktural di atas TP1, atau ekstensi 3R bila harga breakout tanpa resistance terdekat. */
  tp2: number;
  /** Alias untuk stop/cut-loss utama. */
  cl1: number;
  /**
   * @deprecated Kompatibilitas API lama.
   * Ini BUKAN cut-loss kedua dan tidak boleh dipakai untuk menunda exit setelah CL1 invalid.
   * Gunakan `emergencyRiskLevel` bila UI admin memang perlu menampilkan stress level.
   */
  cl2: number;
  /**
   * Stress/emergency level 2R di bawah entry. Bukan rekomendasi menahan posisi setelah stop.
   * Disediakan hanya sebagai informasi risiko ekstrem/backward compatibility.
   */
  emergencyRiskLevel: number;
  rr: number;
  /** Persentase risiko entry -> stop executable setelah pembulatan fraksi IDX. */
  riskPct: number;
  /** Jarak stop dalam satuan ATR setelah pembulatan fraksi IDX. */
  riskAtr: number;
  /** Support yang BENAR-BENAR dipakai untuk stop; null bila fallback ATR. */
  support: StructuralLevel | null;
  /** Support terdekat walaupun belum cukup sentuhan; hanya untuk diagnostik. */
  nearestSupport: StructuralLevel | null;
  resistance: StructuralLevel | null;
  supportQuality: SupportQuality;
  stopSource: 'STRUCTURE_ATR' | 'ATR';
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

const IDX_TICK_BANDS: readonly [number, number][] = [
  [200, 1],
  [500, 2],
  [2000, 5],
  [5000, 10],
  [Infinity, 25],
];

export function idxTick(price: number): number {
  for (const [ceiling, tick] of IDX_TICK_BANDS) {
    if (price < ceiling) return tick;
  }
  return 25;
}

export function roundToIdxTick(value: number, mode: 'down' | 'up' | 'nearest'): number {
  const tick = idxTick(value);
  const quotient = value / tick;
  const rounded = mode === 'down'
    ? Math.floor(quotient)
    : mode === 'up'
      ? Math.ceil(quotient)
      : Math.round(quotient);
  return rounded * tick;
}

/**
 * Setup long deterministik berbasis data pasar nyata.
 *
 * Prinsip:
 * - entry = harga saat ini, lalu dibulatkan ke fraksi IDX;
 * - support struktural hanya boleh menjadi basis stop bila punya >=2 sentuhan;
 * - support 1 sentuhan dianggap WEAK dan TIDAK dipakai sebagai stop: fallback 1.5x ATR;
 * - bila support terkonfirmasi dipakai, stop diletakkan di bawah support dengan buffer
 *   0.25 ATR dan tidak lebih ketat dari 0.75 ATR dari entry;
 * - TP1 = resistance struktural yang masih memenuhi minimal 1.5R, atau default 2R;
 * - TP2 = resistance berikutnya atau ekstensi 3R;
 * - seluruh RR dihitung ulang dari level executable setelah pembulatan fraksi IDX.
 *
 * Parameter ATR/RR masih harus divalidasi empiris melalui TP/CL Validation Lab.
 * Fungsi ini sengaja fail-closed bila data/risk-reward tidak memadai.
 */
export function buildLongTradingSetup(
  history: SwingBar[],
  currentPrice: number,
  atr: number | null | undefined,
): LongTradingSetup | null {
  if (!Array.isArray(history) || history.length < 15) return null;
  if (!isFinitePositive(currentPrice) || !isFinitePositive(atr)) return null;

  const zones = findStructuralZones(history, currentPrice);
  const nearestSupport = zones.support;
  const confirmedSupport =
    nearestSupport && nearestSupport.touches >= MIN_CONFIRMED_LEVEL_TOUCHES
      ? nearestSupport
      : null;

  const supportQuality: SupportQuality = confirmedSupport
    ? 'CONFIRMED'
    : nearestSupport
      ? 'WEAK'
      : 'NONE';

  const structuralStop = confirmedSupport
    ? confirmedSupport.price - atr * 0.25
    : null;
  const atrStop = currentPrice - atr * 1.5;

  // Support hanya dipakai bila level terkonfirmasi. `Math.min` menjaga stop tidak terlalu
  // ketat ketika support sangat dekat dengan entry. Kalau support hanya 1 sentuhan,
  // jangan memberi presisi palsu: gunakan fallback volatilitas (ATR).
  const stop = structuralStop != null
    ? Math.min(currentPrice - atr * 0.75, structuralStop)
    : atrStop;

  if (!Number.isFinite(stop) || stop <= 0 || stop >= currentPrice) return null;

  const risk = currentPrice - stop;
  if (!isFinitePositive(risk)) return null;

  const sortedResistance = zones.levels
    .filter((level) => level.price > currentPrice)
    .sort((a, b) => a.price - b.price);

  const firstResistance = sortedResistance[0] ?? null;
  const minTarget = currentPrice + risk * MIN_LONG_RR;

  // Resistance terlalu dekat = overhead supply. Jangan memaksakan setup dengan RR buruk.
  if (firstResistance && firstResistance.price < minTarget) return null;

  const target2R = currentPrice + risk * 2;
  const tp1Raw = firstResistance && firstResistance.price < target2R
    ? firstResistance.price
    : target2R;

  const targetAboveTp1 = sortedResistance.find((level) => level.price > tp1Raw);
  const tp2Raw = targetAboveTp1?.price ?? currentPrice + risk * 3;

  const entry = roundToIdxTick(currentPrice, 'nearest');
  const roundedStop = roundToIdxTick(stop, 'down');
  const tp1 = roundToIdxTick(tp1Raw, 'up');
  const tp2 = roundToIdxTick(tp2Raw, 'up');

  // Tetap dipertahankan untuk kontrak API lama, tetapi semantiknya sekarang eksplisit:
  // stress/emergency level, BUKAN "CL kedua".
  const emergencyRiskLevel = roundToIdxTick(currentPrice - risk * 2, 'down');

  const roundedRisk = entry - roundedStop;
  const roundedRr = roundedRisk > 0 ? (tp1 - entry) / roundedRisk : null;
  if (roundedRr == null || !Number.isFinite(roundedRr) || roundedRr < MIN_LONG_RR) return null;

  const riskPct = (roundedRisk / entry) * 100;
  const riskAtr = roundedRisk / atr;

  return {
    entry,
    stop: roundedStop,
    tp1,
    tp2,
    cl1: roundedStop,
    cl2: emergencyRiskLevel,
    emergencyRiskLevel,
    rr: parseFloat(roundedRr.toFixed(2)),
    riskPct: parseFloat(riskPct.toFixed(2)),
    riskAtr: parseFloat(riskAtr.toFixed(2)),
    support: confirmedSupport,
    nearestSupport,
    resistance: firstResistance,
    supportQuality,
    stopSource: confirmedSupport ? 'STRUCTURE_ATR' : 'ATR',
  };
}
