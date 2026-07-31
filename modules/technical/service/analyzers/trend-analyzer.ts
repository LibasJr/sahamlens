export function analyze(history: any[], currentPrice: number) {
  if (history.length < 200) return { label: 'Trend MA (20,50,200)', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  const sum20 = history.slice(-20).reduce((acc, h) => acc + h.Close, 0);
  const ma20 = sum20 / 20;

  const sum50 = history.slice(-50).reduce((acc, h) => acc + h.Close, 0);
  const ma50 = sum50 / 50;

  const sum200 = history.slice(-200).reduce((acc, h) => acc + h.Close, 0);
  const ma200 = sum200 / 200;

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (currentPrice > ma20 && ma20 > ma50 && ma50 > ma200) {
    decision = 'BULLISH';
    confidence = Math.min(95, 60 + ((currentPrice - ma200) / ma200) * 100);
  } else if (currentPrice < ma20 && ma20 < ma50 && ma50 < ma200) {
    decision = 'BEARISH';
    confidence = Math.min(95, 60 + ((ma200 - currentPrice) / currentPrice) * 100);
  } else if (currentPrice > ma200) {
    decision = 'NEUTRAL'; // Just above ma200 but not full uptrend
    confidence = 50;
  } else {
    decision = 'BEARISH'; // General bearish if not satisfying other rules
    confidence = 60;
  }

  return {
    label: 'MA Trend IDX (20,50,200)',
    value: `P:${currentPrice}, MA20:${ma20.toFixed(0)}, MA50:${ma50.toFixed(0)}, MA200:${ma200.toFixed(0)}`,
    decision,
    confidence: Math.round(confidence)
  };
}
