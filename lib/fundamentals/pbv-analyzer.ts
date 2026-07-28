export function analyze(data: any) {
  const pbv = data?.defaultKeyStatistics?.priceToBook;
  if (!pbv) return { label: 'PBV (Price to Book)', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (pbv < 1) {
    decision = 'BULLISH';
    confidence = Math.min(99, 100 - (pbv * 20));
  } else if (pbv > 3) {
    decision = 'BEARISH';
    confidence = Math.min(95, 50 + (pbv * 10));
  } else {
    confidence = 60;
  }

  return { label: 'PBV Ratio (Valuation)', value: `${pbv.toFixed(2)}x`, decision, confidence: Math.round(confidence) };
}
