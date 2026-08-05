function adjustedCloseOf(h: any): number | null {
  return typeof h?.AdjClose === 'number' && Number.isFinite(h.AdjClose) && h.AdjClose > 0
    ? h.AdjClose
    : null;
}

// FASE 3: MA trend return-based memakai adjusted close eksplisit dan current adjusted
// dari bar terakhir. Tidak lagi mengasumsikan regularMarketPrice raw bisa dibandingkan
// langsung dengan MA adjusted.
export function analyze(history: any[], currentPrice: number) {
  if (history.length < 200) {
    return {
      label: 'MA Trend IDX (20,50,200)',
      value: 'N/A',
      decision: 'NEUTRAL',
      confidence: 0,
      raw: { ma20: null as number | null, ma50: null as number | null, ma200: null as number | null },
    };
  }
  if (history.some((h) => adjustedCloseOf(h) == null)) {
    return {
      label: 'MA Trend IDX (20,50,200)',
      value: 'N/A (MISSING_ADJUSTED_PRICE)',
      decision: 'NEUTRAL',
      confidence: 0,
      raw: { ma20: null as number | null, ma50: null as number | null, ma200: null as number | null },
    };
  }

  const closeOf = (h: any) => adjustedCloseOf(h) as number;
  const currentAdjustedPrice = closeOf(history[history.length - 1]);
  const sum20 = history.slice(-20).reduce((acc, h) => acc + closeOf(h), 0);
  const ma20 = sum20 / 20;

  const sum50 = history.slice(-50).reduce((acc, h) => acc + closeOf(h), 0);
  const ma50 = sum50 / 50;

  const sum200 = history.slice(-200).reduce((acc, h) => acc + closeOf(h), 0);
  const ma200 = sum200 / 200;

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (currentAdjustedPrice > ma20 && ma20 > ma50 && ma50 > ma200) {
    decision = 'BULLISH';
    confidence = Math.min(95, 60 + ((currentAdjustedPrice - ma200) / ma200) * 100);
  } else if (currentAdjustedPrice < ma20 && ma20 < ma50 && ma50 < ma200) {
    decision = 'BEARISH';
    confidence = Math.min(95, 60 + ((ma200 - currentAdjustedPrice) / currentAdjustedPrice) * 100);
  } else if (currentAdjustedPrice > ma200) {
    decision = 'NEUTRAL'; // Just above ma200 but not full uptrend
    confidence = 50;
  } else {
    decision = 'BEARISH'; // General bearish if not satisfying other rules
    confidence = 60;
  }

  return {
    label: 'MA Trend IDX (20,50,200)',
    value: `P(adj):${currentAdjustedPrice}, MA20:${ma20.toFixed(0)}, MA50:${ma50.toFixed(0)}, MA200:${ma200.toFixed(0)}`,
    decision,
    confidence: Math.round(confidence),
    // `raw` (angka asli, pola temuan M-03) - dipakai RiskRewardCalculator & badge MA
    // Status supaya tidak ada lagi konsumen yang mem-parse string tampilan (temuan M-8).
    raw: { ma20, ma50, ma200 },
  };
}
