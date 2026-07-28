export function analyze(history: any[], currentPrice: number) {
  if (history.length < 20) return { label: 'Support & Resistance', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  let maxHigh = 0;
  let minLow = Infinity;

  for (let i = history.length - 20; i < history.length; i++) {
    if (history[i].High > maxHigh) maxHigh = history[i].High;
    if (history[i].Low < minLow) minLow = history[i].Low;
  }

  const distToSupport = ((currentPrice - minLow) / currentPrice) * 100;
  const distToResistance = ((maxHigh - currentPrice) / currentPrice) * 100;

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (distToSupport < 2 && distToResistance > 5) {
    decision = 'BULLISH'; // Near support, far from resistance
    confidence = Math.min(90, 95 - distToSupport * 10);
  } else if (distToResistance < 2 && distToSupport > 5) {
    decision = 'BEARISH'; // Near resistance, far from support
    confidence = Math.min(90, 95 - distToResistance * 10);
  } else if (distToSupport < distToResistance) {
    decision = 'BULLISH';
    confidence = 60;
  } else {
    decision = 'BEARISH';
    confidence = 60;
  }

  return {
    label: 'Support & Resistance (20D)',
    value: `Sup: ${minLow.toFixed(0)}, Res: ${maxHigh.toFixed(0)}`,
    decision,
    confidence: Math.round(confidence)
  };
}
