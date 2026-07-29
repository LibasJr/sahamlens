export function analyze(history: any[], currentPrice: number) {
  if (history.length < 20) return { label: 'Volume Analysis', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  let totalVol = 0;
  for (let i = history.length - 21; i < history.length - 1; i++) {
    totalVol += history[i].Volume;
  }
  const avgVol = totalVol / 20;
  const currentVol = history[history.length - 1].Volume;
  
  const priceChange = history[history.length - 1].Close - history[history.length - 2].Close;

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (currentVol > 1.5 * avgVol) {
    // High volume
    const ratio = currentVol / avgVol;
    confidence = Math.min(99, 50 + ratio * 15);
    decision = priceChange >= 0 ? 'BULLISH' : 'BEARISH';
  } else {
    // Low volume
    decision = 'NEUTRAL';
    confidence = 50;
  }

  return {
    label: 'Volume vs Avg 20D',
    value: `Vol: ${(currentVol / 1000000).toFixed(1)}M, Avg: ${(avgVol / 1000000).toFixed(1)}M`,
    decision,
    confidence: Math.round(confidence)
  };
}
