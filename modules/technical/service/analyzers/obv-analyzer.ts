import { calculateObvSeries, obvSlope } from '../obv';

const OBV_LOOKBACK = 10;
const MIN_BARS = OBV_LOOKBACK + 1;

// Basis harga: AdjClose untuk arah naik/turun (lihat obv.ts) - Volume sendiri tidak
// disesuaikan. Missing adjusted price membuat indikator N/A, pola sama dengan
// rsi-analyzer.ts/macd-analyzer.ts.
export function analyze(history: any[], currentPrice: number) {
  const empty = { label: 'OBV (10)', value: 'N/A', decision: 'NEUTRAL', confidence: 0, raw: { obv: null as number | null, slope: null as number | null } };
  if (!Array.isArray(history) || history.length < MIN_BARS) return empty;

  const bars = history.map((h) => ({
    adjClose: typeof h.AdjClose === 'number' && Number.isFinite(h.AdjClose) && h.AdjClose > 0 ? h.AdjClose : null,
    volume: typeof h.Volume === 'number' && Number.isFinite(h.Volume) && h.Volume >= 0 ? h.Volume : null,
  }));
  if (bars.some((b) => b.adjClose == null || b.volume == null)) {
    return { ...empty, value: 'N/A (MISSING_ADJUSTED_PRICE_OR_VOLUME)' };
  }

  const series = calculateObvSeries(bars as { adjClose: number; volume: number }[]);
  // Gerbang kedua: pemeriksaan di atas sudah menolak bar cacat, tapi calculateObvSeries
  // memeriksanya lagi secara mandiri (fail-closed) - kalau ia tetap menolak, hormati itu
  // dan jangan paksa hitung.
  if (series == null) return { ...empty, value: 'N/A (MISSING_ADJUSTED_PRICE_OR_VOLUME)' };
  const slope = obvSlope(series, OBV_LOOKBACK);
  if (slope == null) return empty;

  const obvNow = series[series.length - 1]!;
  const recentVolumes = bars.slice(-OBV_LOOKBACK).map((b) => b!.volume as number);
  const avgVolume = recentVolumes.reduce((sum, v) => sum + v, 0) / recentVolumes.length;
  // Normalisasi slope terhadap volume tipikal `lookback` hari itu - saham yang ramai
  // butuh slope absolut jauh lebih besar untuk dianggap sinyal kuat daripada saham sepi.
  const normalized = avgVolume > 0 ? Math.abs(slope) / (avgVolume * OBV_LOOKBACK) : 0;

  let decision = 'NEUTRAL';
  let confidence = 50;
  if (slope > 0) {
    decision = 'BULLISH'; // akumulasi
    confidence = Math.round(Math.min(90, 50 + normalized * 200));
  } else if (slope < 0) {
    decision = 'BEARISH'; // distribusi
    confidence = Math.round(Math.min(90, 50 + normalized * 200));
  }

  return {
    label: 'OBV (10)',
    value: `OBV: ${obvNow >= 0 ? '+' : ''}${Math.round(obvNow).toLocaleString('id-ID')}, slope 10D: ${slope >= 0 ? '+' : ''}${Math.round(slope).toLocaleString('id-ID')}`,
    decision,
    confidence,
    raw: { obv: obvNow, slope },
  };
}
