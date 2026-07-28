export function analyze(data: any) {
  const growth = data?.defaultKeyStatistics?.earningsQuarterlyGrowth;
  if (growth === undefined) return { label: 'EPS Growth (QoQ)', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  const growthPct = growth * 100;
  let decision = 'NEUTRAL';
  let confidence = 50;

  if (growthPct > 10) {
    decision = 'BULLISH';
    confidence = Math.min(99, 60 + (growthPct));
  } else if (growthPct < 0) {
    decision = 'BEARISH';
    confidence = Math.min(99, 60 + Math.abs(growthPct));
  } else {
    confidence = 60;
  }

  return { label: 'EPS Growth (QoQ)', value: `${growthPct.toFixed(2)}%`, decision, confidence: Math.round(confidence) };
}
