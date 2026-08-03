// `raw.atr` (angka asli, temuan M-03) disediakan supaya pemanggil (app/api/council/
// route.ts) tidak perlu parse string `value`.
export function analyze(history: any[], currentPrice: number) {
  if (history.length < 15) return { label: 'Volatility (ATR)', value: 'N/A', decision: 'NEUTRAL', confidence: 0, raw: { atr: null as number | null } };

  let trSum = 0;
  for (let i = history.length - 14; i < history.length; i++) {
    const high = history[i].High;
    const low = history[i].Low;
    const prevClose = history[i - 1].Close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trSum += tr;
  }
  const atr = trSum / 14;
  const volatilityPct = (atr / currentPrice) * 100;

  // BUG FIX (audit integritas data 2026-08-03, temuan H-08): sebelumnya volatilitas
  // TINGGI divote BEARISH dan volatilitas RENDAH divote BULLISH - tapi ATR mengukur
  // BESARAN pergerakan harga, bukan ARAHNYA. Saham yang melonjak +8% dan saham yang
  // anjlok -8% punya ATR yang sama persis dan dulu diberi vote BEARISH yang sama. Vote
  // arah palsu ini ikut ditimbang di calculateConsensus() (bobot sama dengan RSI/MACD)
  // dan sebagai risk_agent (bobot 10%) di orchestrator - efeknya saham blue-chip yang
  // lamban selalu dapat vote BULLISH gratis, saham small-cap yang volatil selalu
  // BEARISH, terlepas dari tren/fundamentalnya. Sekarang decision SELALU NEUTRAL (tidak
  // ikut ditimbang sebagai bull/bear di consensus) - label & confidence tetap
  // melaporkan besaran volatilitas untuk konteks risiko, bukan sebagai sinyal arah.
  const confidence = volatilityPct > 3
    ? Math.min(90, 50 + volatilityPct * 5)
    : volatilityPct < 1.5
      ? Math.min(90, 50 + (1.5 - volatilityPct) * 20)
      : 50;

  return {
    label: 'Volatility (ATR 14)',
    value: `ATR: ${atr.toFixed(0)} (${volatilityPct.toFixed(2)}%)`,
    decision: 'NEUTRAL',
    confidence: Math.round(confidence),
    raw: { atr },
  };
}
