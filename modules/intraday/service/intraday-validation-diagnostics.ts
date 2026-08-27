// Focused diagnostics used by the LensIntraday validation orchestrator.
//
// This module intentionally contains only deterministic calculations over already-loaded
// observations. It performs no fetches and makes no model acceptance decisions. Keeping
// these concerns separate makes the main validation service easier to audit without
// changing any formula, threshold, or persisted output shape.

import {
  INTRADAY_COMPONENT_KEYS,
  INTRADAY_COST_SCENARIOS,
  MAX_HEALTHY_COMPONENT_SATURATION,
  effectiveSlippageBps,
  minHalfSpreadBps,
  type IdxPriceFractionBand,
  type IntradayCostConfig,
  type IntradayRunConfig,
} from '../constants/intraday-model';
import type { ObservationRow } from '../repository/intraday.repository';
import { mean, median, round } from './intraday-stats';

/** Diagnostik SEBARAN FITUR. Tidak pernah menyentuh net return. */
export interface ComponentDiagnosticRow {
  component: string;
  samples: number;
  meanScore: number | null;
  p05: number | null;
  p50: number | null;
  p95: number | null;
  /** Porsi observasi yang mentok di 0 atau 100 karena rentang pemetaan terlalu sempit. */
  saturatedShare: number | null;
  healthy: boolean;
}

export interface SpreadFloorReport {
  /** Porsi trade yang minimal satu sisinya ditentukan lantai fraksi harga. */
  bindingShare: number | null;
  entryBindingShare: number | null;
  exitBindingShare: number | null;
  medianAppliedSlippageBps: number | null;
  medianEntrySlippageBps: number | null;
  medianExitSlippageBps: number | null;
  maxAppliedSlippageBps: number | null;
  note: string;
}

export interface CostSensitivityRow {
  scenario: string;
  label: string;
  costVersion: string;
  avgNetReturn: number | null;
  medianNetReturn: number | null;
  winRate: number | null;
  profitFactor: number | null;
  stillPositive: boolean;
}

/**
 * Lantai setengah fraksi harga ikut diterapkan di sini, PERSIS seperti di
 * simulateIntradayOutcome. Kalau tidak, tabel sensitivitas biaya akan melaporkan
 * skenario "slippage rendah" yang secara fisik tidak mungkin terjadi pada saham murah.
 */
export function netReturnUnderCost(
  entryPriceRaw: number,
  exitPriceRaw: number,
  cost: IntradayCostConfig,
  priceFractions?: IdxPriceFractionBand[],
): number {
  const entrySlip = effectiveSlippageBps(entryPriceRaw, cost.slippageEntryBps, priceFractions);
  const exitSlip = effectiveSlippageBps(exitPriceRaw, cost.slippageExitBps, priceFractions);
  const entry = entryPriceRaw * (1 + entrySlip / 10_000) * (1 + cost.buyFeePct / 100);
  const exit = exitPriceRaw * (1 - exitSlip / 10_000) * (1 - cost.sellFeePct / 100);
  return exit / entry - 1;
}

export function buildCostSensitivity(
  rows: ObservationRow[],
  priceFractions?: IdxPriceFractionBand[],
): CostSensitivityRow[] {
  const usable = rows.filter(
    (row) =>
      row.fillStatus === 'FILLED' &&
      row.entryPriceRaw != null &&
      row.exitPriceRaw != null &&
      row.entryPriceRaw > 0,
  );

  return Object.entries(INTRADAY_COST_SCENARIOS).map(([scenario, cost]) => {
    const nets = usable.map((row) =>
      netReturnUnderCost(row.entryPriceRaw!, row.exitPriceRaw!, cost, priceFractions),
    );
    const wins = nets.filter((net) => net > 0);
    const losses = nets.filter((net) => net <= 0);
    const grossProfit = wins.reduce((sum, value) => sum + value, 0);
    const grossLoss = Math.abs(losses.reduce((sum, value) => sum + value, 0));
    const avg = mean(nets);
    return {
      scenario,
      label: cost.label,
      costVersion: cost.version,
      avgNetReturn: round(avg),
      medianNetReturn: round(median(nets)),
      winRate: nets.length ? round(wins.length / nets.length, 4) : null,
      profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 4) : null,
      stillPositive: avg != null && avg > 0,
    };
  });
}

export const COMPONENT_DIAGNOSTIC_NOTE =
  'Diagnostik ini membaca SEBARAN KOMPONEN saja dan tidak pernah menyentuh net return. ' +
  'Gunanya menjawab satu pertanyaan yang sah tanpa fitting: apakah rentang pemetaan ' +
  'komponen terlalu sempit, sehingga terlalu banyak observasi mentok di 0/100 dan ' +
  'komponen itu kehilangan daya bedanya. Menyetel rentang sampai WIN RATE membaik adalah ' +
  'hal yang berbeda, dan itu fitting - jangan lakukan.';

function percentileOf(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return round(sorted[lo]!, 2);
  return round(sorted[lo]! * (hi - index) + sorted[hi]! * (index - lo), 2);
}

export function buildComponentDiagnostics(
  rows: ObservationRow[],
): { rows: ComponentDiagnosticRow[]; note: string } {
  const withComponents = rows.filter((row) => row.componentScores != null);
  const diagnostics = INTRADAY_COMPONENT_KEYS.map((key) => {
    const values = withComponents
      .map((row) => row.componentScores![key])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const saturated = values.filter((value) => value <= 0 || value >= 100).length;
    const saturatedShare = values.length ? saturated / values.length : null;
    return {
      component: key,
      samples: values.length,
      meanScore: round(mean(values), 2),
      p05: percentileOf(values, 0.05),
      p50: percentileOf(values, 0.5),
      p95: percentileOf(values, 0.95),
      saturatedShare: round(saturatedShare, 4),
      healthy: saturatedShare != null && saturatedShare <= MAX_HEALTHY_COMPONENT_SATURATION,
    };
  });
  return { rows: diagnostics, note: COMPONENT_DIAGNOSTIC_NOTE };
}

export const SPREAD_FLOOR_NOTE =
  'Provider ini tidak menyediakan bid-ask spread, jadi spread sesungguhnya TIDAK diketahui. ' +
  'Yang dipakai adalah batas bawahnya yang bisa dibuktikan: harga hanya bergerak dalam ' +
  'kelipatan fraksi harga IDX, sehingga menyeberangi spread menelan minimal setengah tick ' +
  'per sisi. Lantai entry dihitung dari harga entry dan lantai exit dari harga exit; slippage ' +
  'yang dipakai = maksimum(asumsi konfigurasi, lantai setengah tick sisi tersebut). ' +
  'Angka ini tetap OPTIMISTIS - spread nyata bisa jauh lebih lebar, terutama saat pasar sepi.';

export function buildSpreadFloorReport(
  rows: ObservationRow[],
  config: IntradayRunConfig,
): SpreadFloorReport {
  const filled = rows.filter(
    (row) =>
      row.fillStatus === 'FILLED' &&
      row.entryPriceRaw != null &&
      row.entryPriceRaw > 0 &&
      row.exitPriceRaw != null &&
      row.exitPriceRaw > 0,
  );
  if (!filled.length) {
    return {
      bindingShare: null,
      entryBindingShare: null,
      exitBindingShare: null,
      medianAppliedSlippageBps: null,
      medianEntrySlippageBps: null,
      medianExitSlippageBps: null,
      maxAppliedSlippageBps: null,
      note: SPREAD_FLOOR_NOTE,
    };
  }

  // Dihitung ulang dari harga entry/exit, bukan mengandalkan kolom yang bisa NULL untuk
  // baris lama. Dengan demikian laporan tetap benar untuk data arsip.
  const entryApplied = filled.map((row) =>
    effectiveSlippageBps(row.entryPriceRaw!, config.cost.slippageEntryBps, config.priceFractions),
  );
  const exitApplied = filled.map((row) =>
    effectiveSlippageBps(row.exitPriceRaw!, config.cost.slippageExitBps, config.priceFractions),
  );
  const entryBinding = filled.filter(
    (row) =>
      minHalfSpreadBps(row.entryPriceRaw!, config.priceFractions) > config.cost.slippageEntryBps,
  ).length;
  const exitBinding = filled.filter(
    (row) =>
      minHalfSpreadBps(row.exitPriceRaw!, config.priceFractions) > config.cost.slippageExitBps,
  ).length;
  const eitherBinding = filled.filter(
    (row) =>
      minHalfSpreadBps(row.entryPriceRaw!, config.priceFractions) > config.cost.slippageEntryBps ||
      minHalfSpreadBps(row.exitPriceRaw!, config.priceFractions) > config.cost.slippageExitBps,
  ).length;

  return {
    bindingShare: round(eitherBinding / filled.length, 4),
    entryBindingShare: round(entryBinding / filled.length, 4),
    exitBindingShare: round(exitBinding / filled.length, 4),
    // Field lama dipertahankan sebagai median entry supaya hasil run tersimpan tetap terbaca.
    medianAppliedSlippageBps: round(median(entryApplied), 2),
    medianEntrySlippageBps: round(median(entryApplied), 2),
    medianExitSlippageBps: round(median(exitApplied), 2),
    maxAppliedSlippageBps: round(Math.max(...entryApplied, ...exitApplied), 2),
    note: SPREAD_FLOOR_NOTE,
  };
}
