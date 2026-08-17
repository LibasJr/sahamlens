import { isIdxMarketHoursNow, todayDateKeyWIB } from '@/shared/market/trading-session';

const UNAVAILABLE = {
  label: 'Volume vs Avg 20D',
  value: 'N/A',
  decision: 'NEUTRAL',
  confidence: 0,
};

export function analyze(history: any[], currentPrice: number) {
  // Perbandingan volume intraday parsial terhadap rata-rata 20 hari penuh tidak berada
  // pada basis yang sama. Jangan memproyeksikan volume penutupan dengan kurva hipotetis;
  // fail-closed sampai bar harian selesai.
  const last = history[history.length - 1];
  const lastDate = typeof last?.Date === 'string' ? last.Date.split('T')[0] : null;
  if (lastDate === todayDateKeyWIB() && isIdxMarketHoursNow()) return UNAVAILABLE;

  // Butuh 20 bar pembanding + 1 bar observasi.
  if (history.length < 21) return UNAVAILABLE;

  const comparison = history.slice(-21, -1);
  const current = history[history.length - 1];
  if (
    !comparison.every((h) => typeof h?.Volume === 'number' && Number.isFinite(h.Volume) && h.Volume >= 0) ||
    typeof current?.Volume !== 'number' || !Number.isFinite(current.Volume) || current.Volume < 0 ||
    typeof current?.Close !== 'number' || !Number.isFinite(current.Close) ||
    typeof history[history.length - 2]?.Close !== 'number' || !Number.isFinite(history[history.length - 2].Close)
  ) return UNAVAILABLE;

  const avgVol = comparison.reduce((sum, h) => sum + h.Volume, 0) / 20;
  if (!(avgVol > 0)) return UNAVAILABLE;
  const currentVol = current.Volume;
  const priceChange = current.Close - history[history.length - 2].Close;

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (currentVol > 1.5 * avgVol) {
    const ratio = currentVol / avgVol;
    confidence = Math.min(99, 50 + ratio * 15);
    decision = priceChange >= 0 ? 'BULLISH' : 'BEARISH';
  }

  return {
    label: 'Volume vs Avg 20D',
    value: `Vol: ${(currentVol / 1000000).toFixed(1)}M, Avg: ${(avgVol / 1000000).toFixed(1)}M`,
    decision,
    confidence: Math.round(confidence),
  };
}
