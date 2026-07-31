export function analyze(data: any) {
  const currentRatio = data?.financialData?.currentRatio;
  if (currentRatio === undefined) return { label: 'Current Ratio', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (currentRatio > 1.5) {
    decision = 'BULLISH';
    confidence = Math.min(90, 50 + (currentRatio * 10));
  } else if (currentRatio < 1) {
    decision = 'BEARISH';
    confidence = Math.min(95, 100 - (currentRatio * 50));
  } else {
    confidence = 60;
  }

  return { label: 'Current Ratio (Liquidity)', value: `${currentRatio.toFixed(2)}x`, decision, confidence: Math.round(confidence) };
}
