export function analyze(data: any) {
  const yieldPct = data?.summaryDetail?.dividendYield;
  if (yieldPct === undefined) return { label: 'Dividend Yield', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  const yieldVal = yieldPct * 100;
  let decision = 'NEUTRAL';
  let confidence = 50;

  const trailingRate = data?.summaryDetail?.trailingAnnualDividendRate;

  if (yieldVal > 4) {
    if (yieldVal > 6 && trailingRate === 0) {
      // SUSPECT DATA: High yield but 0 trailing rate (likely Yahoo Finance quarterly bug)
      decision = 'NEUTRAL';
      confidence = 50;
      return { label: 'Dividend Yield (Anomali API)', value: `${yieldVal.toFixed(2)}%`, decision, confidence };
    } else {
      decision = 'BULLISH';
      confidence = Math.min(95, 50 + (yieldVal * 5));
    }
  } else if (yieldVal === 0) {
    decision = 'BEARISH';
    confidence = 60; // Not strictly bearish, but lack of dividend
  } else {
    confidence = 60;
  }

  return { label: 'Dividend Yield', value: `${yieldVal.toFixed(2)}%`, decision, confidence: Math.round(confidence) };
}
