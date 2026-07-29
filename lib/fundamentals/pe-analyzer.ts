export function analyze(data: any) {
  const pe = data?.summaryDetail?.trailingPE || data?.summaryDetail?.forwardPE;
  if (!pe) return { label: 'P/E Ratio', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (pe < 15) {
    decision = 'BULLISH';
    confidence = Math.min(95, 100 - (pe * 5));
  } else if (pe > 25) {
    decision = 'BEARISH';
    confidence = Math.min(95, 50 + (pe - 25) * 2);
  } else {
    confidence = 60;
  }

  return { label: 'P/E Ratio (Valuation)', value: `${pe.toFixed(2)}x`, decision, confidence: Math.round(confidence) };
}
