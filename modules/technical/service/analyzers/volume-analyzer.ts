export function analyze(history: any[], currentPrice: number) {
  // BUG FIX (audit logika & algoritma 2026-08-05, temuan M-15): penjaga lama `< 20`
  // meloloskan histori TEPAT 20 bar, padahal loop di bawah mulai dari indeks
  // `length - 21` = -1 -> `history[-1]` undefined -> totalVol NaN -> seluruh perbandingan
  // di bawah false -> analyzer diam-diam melaporkan NEUTRAL/50 seolah itu hasil
  // pengukuran. Butuh 21 bar: 20 bar rata-rata + 1 bar hari ini.
  if (history.length < 21) return { label: 'Volume Analysis', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  let totalVol = 0;
  for (let i = history.length - 21; i < history.length - 1; i++) {
    totalVol += history[i].Volume;
  }
  const avgVol = totalVol / 20;
  const currentVol = history[history.length - 1].Volume;
  
  const priceChange = history[history.length - 1].Close - history[history.length - 2].Close;

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (currentVol > 1.5 * avgVol) {
    // High volume
    const ratio = currentVol / avgVol;
    confidence = Math.min(99, 50 + ratio * 15);
    decision = priceChange >= 0 ? 'BULLISH' : 'BEARISH';
  } else {
    // Low volume
    decision = 'NEUTRAL';
    confidence = 50;
  }

  return {
    label: 'Volume vs Avg 20D',
    value: `Vol: ${(currentVol / 1000000).toFixed(1)}M, Avg: ${(avgVol / 1000000).toFixed(1)}M`,
    decision,
    confidence: Math.round(confidence)
  };
}
