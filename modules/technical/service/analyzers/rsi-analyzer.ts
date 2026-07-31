export function analyze(history: any[], currentPrice: number) {
  if (history.length < 15) return { label: 'RSI 14', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };
  
  let gains = 0, losses = 0;
  for (let i = history.length - 14; i < history.length; i++) {
    const diff = history[i].Close - history[i - 1].Close;
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  
  let rs = gains / losses;
  let rsi = losses === 0 ? 100 : 100 - (100 / (1 + rs));

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (rsi < 40) {
    decision = 'BULLISH'; // Oversold -> buy signal
    confidence = Math.round(100 - rsi);
  } else if (rsi > 78) {
    decision = 'BEARISH'; // Overbought -> sell signal
    confidence = Math.round(rsi);
  } else {
    // Normal range
    if (rsi >= 50 && rsi <= 70) {
      decision = 'BULLISH';
      confidence = Math.round(rsi);
    } else {
      decision = 'BEARISH';
      confidence = Math.round(100 - rsi);
    }
  }

  return {
    label: 'RSI 14',
    value: `RSI: ${rsi.toFixed(2)}`,
    decision,
    confidence
  };
}
