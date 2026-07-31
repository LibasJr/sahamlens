export function analyze(data: any) {
  const margin = data?.financialData?.profitMargins;
  if (margin === undefined) return { label: 'Net Profit Margin', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  const marginPct = margin * 100;
  let decision = 'NEUTRAL';
  let confidence = 50;

  if (marginPct > 15) {
    decision = 'BULLISH';
    confidence = Math.min(95, 60 + (marginPct - 15) * 2);
  } else if (marginPct < 5) {
    decision = 'BEARISH';
    confidence = Math.min(95, 90 - (marginPct * 2));
  } else {
    confidence = 60;
  }

  return { label: 'Net Profit Margin', value: `${marginPct.toFixed(2)}%`, decision, confidence: Math.round(confidence) };
}
