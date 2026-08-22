import { calculateAdx, ADX_PERIOD } from '../adx';

const MIN_BARS = 2 * ADX_PERIOD;

// Basis harga: RAW High/Low/Close (OHLC-dependent), sama seperti ATR/Stochastic.
//
// ADX sendiri TIDAK terarah - ia cuma mengukur KEKUATAN tren, bukan arahnya (persis
// alasan yang sama dengan ATR di volatility-analyzer.ts, temuan H-08). Arah datang dari
// +DI vs -DI. Threshold 25 adalah ambang baku Wilder untuk "tren cukup kuat untuk
// diikuti" - di bawah itu pasar dianggap ranging/tanpa tren, dan +DI/-DI bisa
// silang-menyilang tanpa makna (choppy), jadi decision NEUTRAL, bukan ikut arah DI yang
// mana pun kebetulan lebih besar.
const ADX_TREND_THRESHOLD = 25;

export function analyze(history: any[], currentPrice: number) {
  const empty = {
    label: 'ADX (14)', value: 'N/A', decision: 'NEUTRAL', confidence: 0,
    raw: { adx: null as number | null, plusDi: null as number | null, minusDi: null as number | null },
  };
  if (!Array.isArray(history) || history.length < MIN_BARS) return empty;

  const bars = history
    .map((h) => ({ high: h.High, low: h.Low, close: h.Close }))
    .filter((b) => Number.isFinite(b.high) && Number.isFinite(b.low) && Number.isFinite(b.close));
  if (bars.length < MIN_BARS) return empty;

  const result = calculateAdx(bars);
  if (!result) return empty;
  const { adx, plusDi, minusDi } = result;

  let decision = 'NEUTRAL';
  let confidence = Math.round(Math.min(90, (adx / ADX_TREND_THRESHOLD) * 45)); // di bawah threshold: 0..45

  if (adx >= ADX_TREND_THRESHOLD) {
    decision = plusDi > minusDi ? 'BULLISH' : plusDi < minusDi ? 'BEARISH' : 'NEUTRAL';
    confidence = Math.round(Math.min(95, 50 + (adx - ADX_TREND_THRESHOLD)));
  }

  return {
    label: 'ADX (14)',
    value: `ADX: ${adx.toFixed(1)}, +DI: ${plusDi.toFixed(1)}, -DI: ${minusDi.toFixed(1)}`,
    decision,
    confidence,
    raw: { adx, plusDi, minusDi },
  };
}
