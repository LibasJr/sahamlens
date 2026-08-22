import { calculateWilliamsR, WILLIAMS_R_PERIOD } from '../williams-r';

// Basis harga: RAW High/Low/Close (OHLC-dependent), sama seperti Stochastic/ATR - lihat
// williams-r.ts.
export function analyze(history: any[], currentPrice: number) {
  const empty = { label: 'Williams %R (14)', value: 'N/A', decision: 'NEUTRAL', confidence: 0, raw: { williamsR: null as number | null } };
  if (!Array.isArray(history) || history.length < WILLIAMS_R_PERIOD) return empty;

  const bars = history
    .map((h) => ({ high: h.High, low: h.Low, close: h.Close }))
    .filter((b) => Number.isFinite(b.high) && Number.isFinite(b.low) && Number.isFinite(b.close));
  if (bars.length < WILLIAMS_R_PERIOD) return empty;

  const value = calculateWilliamsR(bars);
  if (value == null) return empty;

  let decision = 'NEUTRAL';
  let confidence = 50;

  // Skala 0 (puncak range) s/d -100 (dasar range). Ambang baku: > -20 overbought,
  // < -80 oversold (mirror dari 80/20 Stochastic pada skala terbalik).
  if (value < -80) {
    decision = 'BULLISH'; // oversold
    confidence = Math.round(Math.min(95, 50 + (-80 - value)));
  } else if (value > -20) {
    decision = 'BEARISH'; // overbought
    confidence = Math.round(Math.min(95, 50 + (value - -20)));
  } else {
    const distanceFromMid = Math.abs(value - -50) / 30; // 0 (tengah -50) .. 1 (di tepi -20/-80)
    confidence = Math.round(50 + distanceFromMid * 20);
    decision = value > -50 ? 'BEARISH' : value < -50 ? 'BULLISH' : 'NEUTRAL';
  }

  return {
    label: 'Williams %R (14)',
    value: `%R: ${value.toFixed(1)}`,
    decision,
    confidence,
    raw: { williamsR: value },
  };
}
