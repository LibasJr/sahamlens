import { calculateRsi } from '../rsi';

// BUG FIX (audit integritas data 2026-08-03, temuan H-01): sebelumnya menghitung RSI
// dengan rata-rata aritmatik sederhana (bias ke atas, lihat rsi.ts untuk detail &
// bukti empiris) - diganti Wilder smoothing baku, satu implementasi dipakai ulang oleh
// seluruh aplikasi (market-summary.service.ts, breakout.service.ts, lib/miniCouncil.ts).
// BUG FIX (audit integritas data 2026-08-03, temuan M-03): pemanggil (app/api/stock/
// [ticker]/route.ts, recommendation.service.ts) SEBELUMNYA mengambil kembali nilai RSI
// numerik dengan mem-parse string `value` yang diformat untuk tampilan manusia
// (`rsiResult.value.replace('RSI: ', '')` lalu `parseFloat`). Kalau format string
// berubah (mis. analyzer mengembalikan 'N/A') atau ada perubahan spasi/pemisah ribuan,
// parseFloat mengembalikan NaN secara DIAM-DIAM dan mengalir ke scoring engine tanpa
// error - satu perubahan kosmetik pada `value` bisa mematikan scoring tanpa terlihat.
// `raw.rsi` (angka asli, bukan string) sekarang disediakan di samping `value` supaya
// pemanggil tidak perlu parsing string sama sekali.
export function analyze(history: any[], currentPrice: number) {
  if (history.length < 15) return { label: 'RSI 14', value: 'N/A', decision: 'NEUTRAL', confidence: 0, raw: { rsi: null as number | null } };

  // FASE 3: RSI return-based memakai adjusted close eksplisit. Missing adjusted price
  // tidak boleh fallback ke raw Close.
  const closes = history.map((h) => typeof h.AdjClose === 'number' && Number.isFinite(h.AdjClose) && h.AdjClose > 0 ? h.AdjClose : null);
  if (closes.some((close) => close == null)) {
    return { label: 'RSI 14', value: 'N/A (MISSING_ADJUSTED_PRICE)', decision: 'NEUTRAL', confidence: 0, raw: { rsi: null as number | null } };
  }
  const rsi = calculateRsi(closes as number[], 14);
  if (rsi === null) return { label: 'RSI 14', value: 'N/A', decision: 'NEUTRAL', confidence: 0, raw: { rsi: null as number | null } };

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (rsi < 40) {
    decision = 'BULLISH'; // Oversold -> buy signal
    confidence = Math.round(100 - rsi);
  } else if (rsi > 78) {
    decision = 'BEARISH'; // Overbought -> sell signal
    confidence = Math.round(rsi);
  } else {
    // Normal range
    if (rsi >= 50 && rsi <= 70) {
      decision = 'BULLISH';
      confidence = Math.round(rsi);
    } else {
      decision = 'BEARISH';
      confidence = Math.round(100 - rsi);
    }
  }

  return {
    label: 'RSI 14',
    value: `RSI: ${rsi.toFixed(2)}`,
    decision,
    confidence,
    raw: { rsi },
  };
}
