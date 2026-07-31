export function analyze(data: any) {
  const roa = data?.financialData?.returnOnAssets;
  if (roa === undefined) return { label: 'Return on Assets', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  const roaPct = roa * 100;
  let decision = 'NEUTRAL';
  let confidence = 50;

  if (roaPct > 10) {
    decision = 'BULLISH';
    confidence = Math.min(95, 60 + (roaPct * 2));
  } else if (roaPct < 2) {
    decision = 'BEARISH';
    confidence = Math.min(95, 90 - (roaPct * 3));
  } else {
    confidence = 60;
  }

  return { label: 'ROA (Efficiency)', value: `${roaPct.toFixed(2)}%`, decision, confidence: Math.round(confidence) };
}
