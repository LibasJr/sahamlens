// AdjClose (disesuaikan dividen, temuan M-01) dipakai konsisten dengan trend-analyzer.ts
// - lihat komentar di sana untuk kenapa membandingkan `currentPrice` (live) dengan SMA
// dari AdjClose TIDAK mencampur basis yang beda (rasio penyesuaian = 1 di bar terakhir).
export function analyze(history: any[], currentPrice: number) {
  if (history.length < 20) return { label: 'Moving Average Score', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  const getSMA = (period: number) => {
    if (history.length < period) return currentPrice;
    let sum = 0;
    for (let i = history.length - period; i < history.length; i++) sum += (history[i].AdjClose ?? history[i].Close);
    return sum / period;
  };

  const sma5 = getSMA(5);
  const sma10 = getSMA(10);
  const sma20 = getSMA(20);

  let score = 0;
  if (currentPrice > sma5) score++;
  if (currentPrice > sma10) score++;
  if (currentPrice > sma20) score++;
  if (sma5 > sma10) score++;
  if (sma10 > sma20) score++;

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (score >= 4) {
    decision = 'BULLISH';
    confidence = 60 + (score * 5);
  } else if (score <= 1) {
    decision = 'BEARISH';
    confidence = 60 + ((5 - score) * 5);
  }

  return {
    label: 'SMA Score (5,10,20)',
    value: `Score: ${score}/5`,
    decision,
    confidence: Math.round(confidence)
  };
}
