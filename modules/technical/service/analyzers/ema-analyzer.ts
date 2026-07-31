export function analyze(history: any[], currentPrice: number) {
  if (history.length < 50) return { label: 'EMA 20/50 Cross', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };
  
  const closes = history.map(h => h.Close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);

  const lastEMA20 = ema20[ema20.length - 1];
  const lastEMA50 = ema50[ema50.length - 1];

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (lastEMA20 > lastEMA50) {
    decision = 'BULLISH';
    confidence = Math.min(100, 50 + ((lastEMA20 - lastEMA50) / lastEMA50) * 500);
  } else if (lastEMA20 < lastEMA50) {
    decision = 'BEARISH';
    confidence = Math.min(100, 50 + ((lastEMA50 - lastEMA20) / lastEMA20) * 500);
  }

  return {
    label: 'EMA 20/50 Cross',
    value: `EMA20: ${lastEMA20.toFixed(0)}, EMA50: ${lastEMA50.toFixed(0)}`,
    decision,
    confidence: Math.round(confidence)
  };
}

function calculateEMA(prices: number[], period: number) {
  const k = 2 / (period + 1);
  let ema = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}
