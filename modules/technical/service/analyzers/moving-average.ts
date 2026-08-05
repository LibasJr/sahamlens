function adjustedCloseOf(h: any): number | null {
  return typeof h?.AdjClose === 'number' && Number.isFinite(h.AdjClose) && h.AdjClose > 0
    ? h.AdjClose
    : null;
}

// FASE 3: SMA return-based memakai AdjClose eksplisit. Tidak ada fallback ke Close
// karena itu mencampur basis adjusted/raw dan menyembunyikan missing adjusted price.
export function analyze(history: any[], currentPrice: number) {
  if (history.length < 20) return { label: 'Moving Average Score', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };
  if (history.some((h) => adjustedCloseOf(h) == null)) {
    return { label: 'SMA Score (5,10,20)', value: 'N/A (MISSING_ADJUSTED_PRICE)', decision: 'NEUTRAL', confidence: 0 };
  }

  const getSMA = (period: number) => {
    if (history.length < period) return currentPrice;
    let sum = 0;
    for (let i = history.length - period; i < history.length; i++) sum += adjustedCloseOf(history[i]) as number;
    return sum / period;
  };
  const currentAdjustedPrice = adjustedCloseOf(history[history.length - 1]) as number;

  const sma5 = getSMA(5);
  const sma10 = getSMA(10);
  const sma20 = getSMA(20);

  let score = 0;
  if (currentAdjustedPrice > sma5) score++;
  if (currentAdjustedPrice > sma10) score++;
  if (currentAdjustedPrice > sma20) score++;
  if (sma5 > sma10) score++;
  if (sma10 > sma20) score++;

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (score >= 4) {
    decision = 'BULLISH';
    confidence = 60 + (score * 5);
  } else if (score <= 1) {
    decision = 'BEARISH';
    confidence = 60 + ((5 - score) * 5);
  }

  return {
    label: 'SMA Score (5,10,20)',
    value: `Score: ${score}/5`,
    decision,
    confidence: Math.round(confidence)
  };
}
