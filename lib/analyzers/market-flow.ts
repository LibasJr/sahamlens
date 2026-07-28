export function analyze(history: any[], currentPrice: number) {
  if (history.length < 15) return { label: 'Market Flow (Accum/Dist)', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  let accum = 0;
  let dist = 0;

  for (let i = history.length - 14; i < history.length; i++) {
    const change = history[i].Close - history[i - 1].Close;
    if (change > 0) {
      accum += history[i].Volume;
    } else if (change < 0) {
      dist += history[i].Volume;
    }
  }

  let decision = 'NEUTRAL';
  let confidence = 50;
  
  const total = accum + dist;
  if (total === 0) return { label: 'Market Flow (A/D)', value: 'N/A', decision: 'NEUTRAL', confidence: 50 };

  const accumPct = (accum / total) * 100;
  
  if (accumPct > 55) {
    decision = 'BULLISH';
    confidence = Math.min(95, accumPct);
  } else if (accumPct < 45) {
    decision = 'BEARISH';
    confidence = Math.min(95, 100 - accumPct);
  }

  return {
    label: 'Accumulation / Distribution',
    value: `Accum: ${accumPct.toFixed(1)}%, Dist: ${(100-accumPct).toFixed(1)}%`,
    decision,
    confidence: Math.round(confidence)
  };
}
