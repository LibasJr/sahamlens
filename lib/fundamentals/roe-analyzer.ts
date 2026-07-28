export function analyze(data: any) {
  const roe = data?.financialData?.returnOnEquity;
  if (roe === undefined) return { label: 'Return on Equity', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  const roePct = roe * 100;
  let decision = 'NEUTRAL';
  let confidence = 50;

  if (roePct > 15) {
    decision = 'BULLISH';
    confidence = Math.min(95, 50 + (roePct * 2));
  } else if (roePct < 5) {
    decision = 'BEARISH';
    confidence = Math.min(95, 90 - (roePct * 2));
  } else {
    confidence = 60;
  }

  return { label: 'ROE (Profitability)', value: `${roePct.toFixed(2)}%`, decision, confidence: Math.round(confidence) };
}
