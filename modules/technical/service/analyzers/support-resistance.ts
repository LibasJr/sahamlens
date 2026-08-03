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
  } else {
    // BUG FIX (audit integritas data 2026-08-03, temuan H-09): dua cabang terakhir
    // SEBELUMNYA hanya `distToSupport < distToResistance ? BULLISH : BEARISH` - TIDAK
    // ADA kondisi NEUTRAL sama sekali di luar dua cabang di atas, jadi kurang lebih 50%
    // saham (yang harganya berada di paruh atas range 20 hari) otomatis divote BEARISH
    // hanya karena posisinya, bukan karena ada sinyal berarti. Ditambah pita netral di
    // tengah range (40%-60% dari support ke resistance) supaya posisi ambigu jujur
    // dilaporkan NEUTRAL, bukan dipaksa memilih salah satu arah.
    const range = distToSupport + distToResistance;
    const posFromSupport = range > 0 ? distToSupport / range : 0.5; // 0 = di support, 1 = di resistance
    if (posFromSupport < 0.4) {
      decision = 'BULLISH';
      confidence = 60;
    } else if (posFromSupport > 0.6) {
      decision = 'BEARISH';
      confidence = 60;
    } else {
      decision = 'NEUTRAL';
      confidence = 50;
    }
  }

  return {
    label: 'Support & Resistance (20D)',
    value: `Sup: ${minLow.toFixed(0)}, Res: ${maxHigh.toFixed(0)}`,
    decision,
    confidence: Math.round(confidence)
  };
}
