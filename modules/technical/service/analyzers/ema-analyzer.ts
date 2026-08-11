import { calculateEmaSeries } from '../ema';

// BUG FIX (audit integritas data 2026-08-03, temuan M-03): `raw` (angka asli) disediakan
// supaya pemanggil (app/api/council/route.ts) tidak perlu parse string `value`.
export function analyze(history: any[], currentPrice: number) {
  if (history.length < 50) return { label: 'EMA 20/50 Cross', value: 'N/A', decision: 'NEUTRAL', confidence: 0, raw: { ema20: null as number | null, ema50: null as number | null } };

  // FASE 3: EMA return-based memakai adjusted close eksplisit. Tidak boleh fallback
  // ke Close karena itu mencampur basis harga di tengah seri.
  const closes = history.map(h => typeof h.AdjClose === 'number' && Number.isFinite(h.AdjClose) && h.AdjClose > 0 ? h.AdjClose : null);
  if (closes.some((close) => close == null)) {
    return { label: 'EMA 20/50 Cross', value: 'N/A (MISSING_ADJUSTED_PRICE)', decision: 'NEUTRAL', confidence: 0, raw: { ema20: null as number | null, ema50: null as number | null } };
  }
  // Satu implementasi EMA untuk seluruh aplikasi - lihat modules/technical/service/ema.ts.
  const ema20 = calculateEmaSeries(closes as number[], 20);
  const ema50 = calculateEmaSeries(closes as number[], 50);

  const lastEMA20 = ema20[ema20.length - 1];
  const lastEMA50 = ema50[ema50.length - 1];

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (lastEMA20 > lastEMA50) {
    decision = 'BULLISH';
    confidence = Math.min(100, 50 + ((lastEMA20 - lastEMA50) / lastEMA50) * 500);
  } else if (lastEMA20 < lastEMA50) {
    decision = 'BEARISH';
    confidence = Math.min(100, 50 + ((lastEMA50 - lastEMA20) / lastEMA20) * 500);
  }

  return {
    label: 'EMA 20/50 Cross',
    value: `EMA20: ${lastEMA20.toFixed(0)}, EMA50: ${lastEMA50.toFixed(0)}`,
    decision,
    confidence: Math.round(confidence),
    raw: { ema20: lastEMA20, ema50: lastEMA50 },
  };
}
