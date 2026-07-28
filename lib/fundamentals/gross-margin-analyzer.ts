export function analyze(data: any) {
  const margin = data?.financialData?.grossMargins;
  if (margin === undefined || margin === null || margin === 0) return { label: 'Gross Margin', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  const marginPct = margin * 100;
  let decision = 'NEUTRAL';
  let confidence = 50;

  if (marginPct > 40) {
    decision = 'BULLISH';
    confidence = Math.min(90, 50 + (marginPct - 40));
  } else if (marginPct < 20) {
    decision = 'BEARISH';
    confidence = Math.min(90, 80 - marginPct);
  } else {
    confidence = 60;
  }

  return { label: 'Gross Margin', value: `${marginPct.toFixed(2)}%`, decision, confidence: Math.round(confidence) };
}
