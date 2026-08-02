export function analyze(data: any) {
  const quickRatio = data?.financialData?.quickRatio;
  if (quickRatio === undefined) return { label: 'Quick Ratio (Liquidity)', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (quickRatio > 1) {
    decision = 'BULLISH';
    confidence = Math.min(90, 50 + (quickRatio * 15));
  } else if (quickRatio < 0.5) {
    decision = 'BEARISH';
    confidence = Math.min(95, 90 - (quickRatio * 40));
  } else {
    confidence = 60;
  }

  return { label: 'Quick Ratio (Liquidity)', value: `${quickRatio.toFixed(2)}x`, decision, confidence: Math.round(confidence) };
}
