export function analyze(history: any[], currentPrice: number) {
  if (history.length < 200) return { label: 'Trend MA200', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  let sum = 0;
  for (let i = history.length - 200; i < history.length; i++) {
    sum += history[i].Close;
  }
  const ma200 = sum / 200;

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (currentPrice > ma200) {
    decision = 'BULLISH';
    confidence = Math.min(95, 60 + ((currentPrice - ma200) / ma200) * 100);
  } else {
    decision = 'BEARISH';
    confidence = Math.min(95, 60 + ((ma200 - currentPrice) / currentPrice) * 100);
  }

  return {
    label: 'Trend Price vs MA200',
    value: `Price: ${currentPrice}, MA200: ${ma200.toFixed(0)}`,
    decision,
    confidence: Math.round(confidence)
  };
}
