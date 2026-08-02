export function analyze(data: any) {
  const margin = data?.financialData?.operatingMargins;
  if (margin === undefined || margin === null) return { label: 'Operating Margin', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  const marginPct = margin * 100;
  let decision = 'NEUTRAL';
  let confidence = 50;

  if (marginPct > 20) {
    decision = 'BULLISH';
    confidence = Math.min(90, 50 + (marginPct - 20));
  } else if (marginPct < 5) {
    decision = 'BEARISH';
    confidence = Math.min(90, 80 - marginPct * 4);
  } else {
    confidence = 60;
  }

  return { label: 'Operating Margin', value: `${marginPct.toFixed(2)}%`, decision, confidence: Math.round(confidence) };
}
