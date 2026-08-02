export function analyze(data: any) {
  const yieldPct = data?.summaryDetail?.dividendYield;
  if (yieldPct === undefined) return { label: 'Dividend Yield', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  const yieldVal = yieldPct * 100;
  let decision = 'NEUTRAL';
  let confidence = 50;

  const trailingRate = data?.summaryDetail?.trailingAnnualDividendRate;

  if (yieldVal > 4) {
    if (yieldVal > 6 && trailingRate === 0) {
      // SUSPECT DATA: yield tinggi tapi trailing dividend rate 0 (kemungkinan bug data
      // kuartalan Yahoo Finance) - jangan tampilkan angka yang meragukan sama sekali
      // (value: 'N/A' + confidence: 0 membuat card ini disembunyikan di UI, pola sama
      // dengan analyzer lain yang datanya tidak tersedia), bukan diberi label "anomali"
      // lalu tetap ditampilkan.
      return { label: 'Dividend Yield', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };
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
