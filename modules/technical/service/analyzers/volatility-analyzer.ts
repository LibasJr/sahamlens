export function analyze(history: any[], currentPrice: number) {
  if (history.length < 15) return { label: 'Volatility (ATR)', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

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

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (volatilityPct > 3) {
    decision = 'BEARISH'; // High volatility usually means high risk/downward pressure
    confidence = Math.min(90, 50 + volatilityPct * 5);
  } else if (volatilityPct < 1.5) {
    decision = 'BULLISH'; // Low volatility means stability
    confidence = Math.min(90, 50 + (1.5 - volatilityPct) * 20);
  }

  return {
    label: 'Volatility (ATR 14)',
    value: `ATR: ${atr.toFixed(0)} (${volatilityPct.toFixed(2)}%)`,
    decision,
    confidence: Math.round(confidence)
  };
}
