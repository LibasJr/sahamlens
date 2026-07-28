export function analyze(data: any) {
  const der = data?.financialData?.debtToEquity;
  if (der === undefined) return { label: 'Debt to Equity', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (der > 200) { // > 2.0 ratio (Yahoo returns percentage/ratio sometimes, usually raw * 100)
    decision = 'BEARISH';
    confidence = Math.min(95, 50 + (der / 10));
  } else if (der < 50) { // < 0.5 ratio
    decision = 'BULLISH';
    confidence = Math.min(90, 100 - der);
  } else {
    confidence = 60;
  }

  return { label: 'Debt/Equity (Risk)', value: `${(der/100).toFixed(2)}x`, decision, confidence: Math.round(confidence) };
}
