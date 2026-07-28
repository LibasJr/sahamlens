export function analyze(history: any[], currentPrice: number) {
  if (history.length < 35) return { label: 'MACD', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  const closes = history.map(h => h.Close);
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  
  const macdLine = ema12.map((val, i) => val - ema26[i]);
  const signalLine = calculateEMA(macdLine, 9);

  const lastMacd = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  const histogram = lastMacd - lastSignal;

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (histogram > 0) {
    decision = 'BULLISH';
    confidence = Math.min(95, 60 + (histogram / currentPrice) * 1000);
  } else if (histogram < 0) {
    decision = 'BEARISH';
    confidence = Math.min(95, 60 + (Math.abs(histogram) / currentPrice) * 1000);
  }

  return {
    label: 'MACD (12,26,9)',
    value: `MACD: ${lastMacd.toFixed(2)}, Sig: ${lastSignal.toFixed(2)}`,
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
