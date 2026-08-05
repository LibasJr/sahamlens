function adjustedCloseOf(h: any): number | null {
  return typeof h?.AdjClose === 'number' && Number.isFinite(h.AdjClose) && h.AdjClose > 0
    ? h.AdjClose
    : null;
}

// FASE 3: momentum return-based memakai adjusted close eksplisit, termasuk current
// pembandingnya. Missing adjusted price => N/A, bukan fallback ke raw Close.
export function analyze(history: any[], currentPrice: number) {
  if (history.length < 6) return { label: 'Momentum 1D/5D', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };
  if (history.some((h) => adjustedCloseOf(h) == null)) {
    return { label: 'Momentum 1D/5D', value: 'N/A (MISSING_ADJUSTED_PRICE)', decision: 'NEUTRAL', confidence: 0 };
  }

  const currentAdjustedPrice = adjustedCloseOf(history[history.length - 1]) as number;
  const close1D = adjustedCloseOf(history[history.length - 2]) as number;
  const close5D = adjustedCloseOf(history[history.length - 6]) as number;

  const pct1D = ((currentAdjustedPrice - close1D) / close1D) * 100;
  const pct5D = ((currentAdjustedPrice - close5D) / close5D) * 100;

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (pct1D > 0 && pct5D > 0) {
    decision = 'BULLISH';
    confidence = Math.min(99, 60 + (pct1D + pct5D) * 2);
  } else if (pct1D < 0 && pct5D < 0) {
    decision = 'BEARISH';
    confidence = Math.min(99, 60 + Math.abs(pct1D + pct5D) * 2);
  } else {
    decision = 'NEUTRAL';
    confidence = 50;
  }

  return {
    label: 'Momentum 1D/5D',
    value: `1D: ${pct1D.toFixed(2)}%, 5D: ${pct5D.toFixed(2)}%`,
    decision,
    confidence: Math.round(confidence)
  };
}
