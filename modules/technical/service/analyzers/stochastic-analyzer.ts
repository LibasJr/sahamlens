import { calculateStochastic, STOCHASTIC_PERIOD, STOCHASTIC_SMOOTH_K, STOCHASTIC_PERIOD_D } from '../stochastic';

const MIN_BARS = STOCHASTIC_PERIOD + STOCHASTIC_SMOOTH_K + STOCHASTIC_PERIOD_D - 2;

// Basis harga: RAW High/Low/Close (OHLC-dependent), sama seperti volatility-analyzer.ts
// (ATR) - posisi harga di dalam range akan palsu di sekitar corporate action kalau
// dicampur dengan AdjClose. Lihat stochastic.ts untuk definisi lengkap.
export function analyze(history: any[], currentPrice: number) {
  const empty = { label: 'Stochastic (14,3,3)', value: 'N/A', decision: 'NEUTRAL', confidence: 0, raw: { k: null as number | null, d: null as number | null } };
  if (!Array.isArray(history) || history.length < MIN_BARS) return empty;

  const bars = history
    .map((h) => ({ high: h.High, low: h.Low, close: h.Close }))
    .filter((b) => Number.isFinite(b.high) && Number.isFinite(b.low) && Number.isFinite(b.close));
  if (bars.length < MIN_BARS) return empty;

  const result = calculateStochastic(bars);
  if (!result) return empty;
  const { k, d } = result;

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (k <= 20) {
    decision = 'BULLISH'; // oversold
    confidence = Math.round(100 - k);
  } else if (k >= 80) {
    decision = 'BEARISH'; // overbought
    confidence = Math.round(k);
  } else if (k > d) {
    decision = 'BULLISH';
    confidence = Math.round(Math.min(90, 50 + (k - d) * 2));
  } else if (k < d) {
    decision = 'BEARISH';
    confidence = Math.round(Math.min(90, 50 + (d - k) * 2));
  }

  return {
    label: 'Stochastic (14,3,3)',
    value: `%K: ${k.toFixed(1)}, %D: ${d.toFixed(1)}`,
    decision,
    confidence,
    raw: { k, d },
  };
}
