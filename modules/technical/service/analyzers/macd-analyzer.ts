import { calculateMacd, MACD_FAST, MACD_SLOW, MACD_SIGNAL } from '../ema';

// BUG FIX (audit integritas data 2026-08-03, temuan M-03): sama seperti rsi-analyzer.ts
// - pemanggil sebelumnya mem-parse macdLine/macdSignal/macdHist dari string `value`
// pakai regex (`/MACD: ([\-\d.]+), Sig: ([\-\d.]+), Hist: ([\-\d.]+)/`). Kalau regex
// tidak match (mis. format berubah), kegagalan DIAM-DIAM menghasilkan 0/0/0 yang masuk
// ke scoring sebagai "MACD bearish" - bukan error yang terlihat. `raw` (angka asli)
// disediakan supaya pemanggil tidak perlu regex sama sekali.
export function analyze(history: any[], currentPrice: number) {
  if (history.length < 35) return { label: 'MACD', value: 'N/A', decision: 'NEUTRAL', confidence: 0, raw: { macdLine: null as number | null, macdSignal: null as number | null, macdHist: null as number | null } };

  // FASE 3: MACD return-based memakai adjusted close eksplisit. Missing adjusted price
  // membuat indikator N/A, bukan fallback diam-diam ke raw Close.
  const closes = history.map(h => typeof h.AdjClose === 'number' && Number.isFinite(h.AdjClose) && h.AdjClose > 0 ? h.AdjClose : null);
  if (closes.some((close) => close == null)) {
    return { label: 'MACD', value: 'N/A (MISSING_ADJUSTED_PRICE)', decision: 'NEUTRAL', confidence: 0, raw: { macdLine: null as number | null, macdSignal: null as number | null, macdHist: null as number | null } };
  }
  // Satu implementasi MACD untuk seluruh aplikasi - lihat modules/technical/service/ema.ts.
  // Sebelumnya file ini punya salinan EMA sendiri, begitu pula ema-analyzer dan
  // lib/miniCouncil (yang salinannya masih memakai seed lama yang salah).
  const macd = calculateMacd(closes as number[], MACD_FAST, MACD_SLOW, MACD_SIGNAL);
  if (!macd) {
    return { label: 'MACD', value: 'N/A', decision: 'NEUTRAL', confidence: 0, raw: { macdLine: null as number | null, macdSignal: null as number | null, macdHist: null as number | null } };
  }
  const lastMacd = macd.macdLine;
  const lastSignal = macd.macdSignal;
  const histogram = macd.macdHist;

  let decision = 'NEUTRAL';
  let confidence = 50;

  // IDX Threshold: BUY = histogram > 0 DAN MACD line > Signal
  if (histogram > 0 && lastMacd > lastSignal) {
    decision = 'BULLISH';
    confidence = Math.min(95, 60 + (histogram / (closes[closes.length - 1] as number)) * 1000);
  } else if (histogram < 0 && lastMacd < lastSignal) {
    decision = 'BEARISH';
    confidence = Math.min(95, 60 + (Math.abs(histogram) / (closes[closes.length - 1] as number)) * 1000);
  }

  return {
    label: 'MACD (12,26,9)',
    value: `MACD: ${lastMacd.toFixed(2)}, Sig: ${lastSignal.toFixed(2)}, Hist: ${histogram.toFixed(2)}`,
    decision,
    confidence: Math.round(confidence),
    raw: { macdLine: lastMacd, macdSignal: lastSignal, macdHist: histogram },
  };
}
