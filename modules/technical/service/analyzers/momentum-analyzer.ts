// BUG FIX (audit integritas data 2026-08-03, temuan M-01): close1D/close5D pakai
// AdjClose (disesuaikan dividen) - kalau tanggal ex-dividend jatuh persis di jendela
// 1-5 hari ini, Close mentah membuat momentum 1D/5D salah baca penurunan harga akibat
// pembagian dividen sebagai BEARISH murni dari pasar.
export function analyze(history: any[], currentPrice: number) {
  if (history.length < 6) return { label: 'Momentum 1D/5D', value: 'N/A', decision: 'NEUTRAL', confidence: 0 };

  const close1D = history[history.length - 2].AdjClose ?? history[history.length - 2].Close;
  const close5D = history[history.length - 6].AdjClose ?? history[history.length - 6].Close;

  const pct1D = ((currentPrice - close1D) / close1D) * 100;
  const pct5D = ((currentPrice - close5D) / close5D) * 100;

  let decision = 'NEUTRAL';
  let confidence = 50;

  if (pct1D > 0 && pct5D > 0) {
    decision = 'BULLISH';
    confidence = Math.min(99, 60 + (pct1D + pct5D) * 2);
  } else if (pct1D < 0 && pct5D < 0) {
    decision = 'BEARISH';
    confidence = Math.min(99, 60 + Math.abs(pct1D + pct5D) * 2);
  } else {
    decision = 'NEUTRAL';
    confidence = 50;
  }

  return {
    label: 'Momentum 1D/5D',
    value: `1D: ${pct1D.toFixed(2)}%, 5D: ${pct5D.toFixed(2)}%`,
    decision,
    confidence: Math.round(confidence)
  };
}
