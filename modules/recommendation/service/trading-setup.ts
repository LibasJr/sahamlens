import { findStructuralZones, type SwingBar, type StructuralLevel } from '../../technical/service/analyzers/swing-levels';

export const MIN_LONG_RR = 1.5;

export interface LongTradingSetup {
  entry: number;
  /** Stop utama berbasis support struktural + buffer ATR, atau fallback ATR kalau belum ada support. */
  stop: number;
  /** Target pertama. Minimal 1.5R; default 2R kalau tidak ada resistance sebelum target. */
  tp1: number;
  /** Target lanjutan: resistance struktural di atas TP1, atau ekstensi 3R bila harga breakout tanpa resistance terdekat. */
  tp2: number;
  /** Alias untuk level cut-loss utama, dipertahankan agar konsumen UI lama tetap sederhana. */
  cl1: number;
  /** Level risiko lanjutan bila stop utama gagal; bukan rekomendasi menahan rugi. */
  cl2: number;
  rr: number;
  support: StructuralLevel | null;
  resistance: StructuralLevel | null;
  stopSource: 'STRUCTURE_ATR' | 'ATR';
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function roundPrice(value: number): number {
  return Math.round(value);
}

/**
 * Setup long deterministik berbasis data pasar nyata:
 * - entry = harga saat ini;
 * - stop = support swing terdekat di bawah harga + buffer ATR, atau 1.5x ATR jika belum
 *   ada support terkonfirmasi;
 * - target = resistance struktural bila memberi RR memadai, atau ekstensi 2R/3R.
 *
 * Fungsi ini sengaja fail-closed: kalau risk/reward minimal tidak terpenuhi, hasilnya
 * null. Lebih baik UI menulis "tidak ada setup RR memadai" daripada memajang TP/CL yang
 * terdengar presisi tapi ekspektansinya buruk.
 */
export function buildLongTradingSetup(
  history: SwingBar[],
  currentPrice: number,
  atr: number | null | undefined,
): LongTradingSetup | null {
  if (!Array.isArray(history) || history.length < 15) return null;
  if (!isFinitePositive(currentPrice) || !isFinitePositive(atr)) return null;

  const zones = findStructuralZones(history, currentPrice);
  const structuralStop = zones.support ? zones.support.price - atr * 0.25 : null;
  const atrStop = currentPrice - atr * 1.5;

  // Jika support ada, stop diletakkan DI BAWAH support dengan buffer ATR. `Math.min`
  // memastikan stop tidak lebih ketat daripada 0.75 ATR dari entry ketika support sangat
  // dekat, sehingga fraksi harga/spread IDX tidak mudah menyentuh stop palsu.
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

  // Resistance yang terlalu dekat adalah overhead supply, bukan target menarik.
  if (firstResistance && firstResistance.price < minTarget) return null;

  const target2R = currentPrice + risk * 2;
  const tp1Raw = firstResistance && firstResistance.price < target2R
    ? firstResistance.price
    : target2R;
  const rr = (tp1Raw - currentPrice) / risk;
  if (!Number.isFinite(rr) || rr < MIN_LONG_RR) return null;

  const targetAboveTp1 = sortedResistance.find((level) => level.price > tp1Raw);
  const tp2Raw = targetAboveTp1?.price ?? currentPrice + risk * 3;

  return {
    entry: roundPrice(currentPrice),
    stop: roundPrice(stop),
    tp1: roundPrice(tp1Raw),
    tp2: roundPrice(tp2Raw),
    cl1: roundPrice(stop),
    cl2: roundPrice(currentPrice - risk * 2),
    rr: parseFloat(rr.toFixed(2)),
    support: zones.support,
    resistance: firstResistance,
    stopSource: zones.support ? 'STRUCTURE_ATR' : 'ATR',
  };
}
