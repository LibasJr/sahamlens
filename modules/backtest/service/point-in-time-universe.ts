/**
 * Point-in-time validation universe.
 *
 * H-02: universe statis yang dipilih memakai likuiditas/volatilitas masa kini tidak
 * boleh diproyeksikan ke masa lalu. Fungsi murni ini menilai satu ticker hanya dari
 * bar yang sudah tersedia sampai tanggal keputusan.
 *
 * Residual survivorship tetap mungkin bila katalog kandidat tidak menyertakan emiten
 * yang sudah delisting. Backfill karena itu memakai katalog IDX seluas yang tersedia
 * dan menyatakan limitation tersebut secara eksplisit.
 */
export const PIT_UNIVERSE_METHOD_VERSION = 'pit-universe-v1';
export const PIT_UNIVERSE_MIN_AVG_VALUE_63D_IDR = 1_000_000_000;
export const PIT_UNIVERSE_MAX_ANNUAL_VOL_PCT = 120;
export const PIT_UNIVERSE_RECENT_BARS = 63;
export const PIT_UNIVERSE_VOL_LOOKBACK_BARS = 252;
export const PIT_UNIVERSE_MIN_RECENT_OBSERVATIONS = 30;
export const PIT_UNIVERSE_MIN_VOL_RETURNS = 60;

export type PointInTimeUniverseReason =
  | 'INSUFFICIENT_RECENT_HISTORY'
  | 'AVG_VALUE_BELOW_FLOOR'
  | 'INSUFFICIENT_VOL_HISTORY'
  | 'VOLATILITY_ABOVE_CAP'
  | 'INVALID_BAR_DATA';

export interface PointInTimeUniverseBar {
  date: string;
  close: number | null;
  volume: number | null;
}

export interface PointInTimeUniverseResult {
  eligible: boolean;
  methodVersion: string;
  reasonCodes: PointInTimeUniverseReason[];
  observationsRecent: number;
  volatilityReturns: number;
  avgClose63d: number | null;
  avgValue63d: number | null;
  annualVolPct: number | null;
}

function finitePositive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function evaluatePointInTimeUniverse(bars: PointInTimeUniverseBar[]): PointInTimeUniverseResult {
  const ordered = [...bars]
    .filter((bar) => /^\d{4}-\d{2}-\d{2}$/.test(bar.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  const recent = ordered.slice(-PIT_UNIVERSE_RECENT_BARS);
  const recentValid = recent
    .map((bar) => ({ close: finitePositive(bar.close), volume: finiteNonNegative(bar.volume) }))
    .filter((bar): bar is { close: number; volume: number } => bar.close != null && bar.volume != null);
  const avgClose63d = mean(recentValid.map((bar) => bar.close));
  const avgValue63d = mean(recentValid.map((bar) => bar.close * bar.volume));

  const volWindow = ordered.slice(-PIT_UNIVERSE_VOL_LOOKBACK_BARS);
  const returns: number[] = [];
  for (let i = 1; i < volWindow.length; i++) {
    const previous = finitePositive(volWindow[i - 1]?.close);
    const current = finitePositive(volWindow[i]?.close);
    if (previous == null || current == null) continue;
    returns.push(current / previous - 1);
  }
  let annualVolPct: number | null = null;
  if (returns.length >= PIT_UNIVERSE_MIN_VOL_RETURNS) {
    const avg = mean(returns)!;
    const variance = returns.reduce((sum, value) => sum + (value - avg) ** 2, 0) / returns.length;
    annualVolPct = Math.sqrt(variance) * Math.sqrt(252) * 100;
  }

  const reasonCodes: PointInTimeUniverseReason[] = [];
  if (recentValid.length < PIT_UNIVERSE_MIN_RECENT_OBSERVATIONS) reasonCodes.push('INSUFFICIENT_RECENT_HISTORY');
  if (recent.length && recentValid.length !== recent.length) reasonCodes.push('INVALID_BAR_DATA');
  if (avgValue63d != null && avgValue63d < PIT_UNIVERSE_MIN_AVG_VALUE_63D_IDR) reasonCodes.push('AVG_VALUE_BELOW_FLOOR');
  if (returns.length < PIT_UNIVERSE_MIN_VOL_RETURNS || annualVolPct == null) reasonCodes.push('INSUFFICIENT_VOL_HISTORY');
  else if (annualVolPct > PIT_UNIVERSE_MAX_ANNUAL_VOL_PCT) reasonCodes.push('VOLATILITY_ABOVE_CAP');
  if (avgValue63d == null && !reasonCodes.includes('INVALID_BAR_DATA')) reasonCodes.push('INVALID_BAR_DATA');

  // M-07: avgClose tetap diagnostic, bukan price floor historis. Yahoo quote OHLC
  // split-adjusted retroaktif, sehingga ambang rupiah absolut historis dapat salah.
  return {
    eligible: reasonCodes.length === 0,
    methodVersion: PIT_UNIVERSE_METHOD_VERSION,
    reasonCodes,
    observationsRecent: recentValid.length,
    volatilityReturns: returns.length,
    avgClose63d,
    avgValue63d,
    annualVolPct,
  };
}
