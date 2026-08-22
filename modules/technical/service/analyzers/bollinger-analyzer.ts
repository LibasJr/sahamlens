import { calculateBollingerBands, BOLLINGER_PERIOD } from '../bollinger-bands';

// Basis harga: AdjClose (price-level indicator, sama seperti moving-average.ts) - lihat
// catatan FASE 3 "wajib AdjClose eksplisit" di trend-analyzer.ts. Missing adjusted price
// membuat indikator N/A, bukan fallback diam-diam ke raw Close (pola sama dengan
// rsi-analyzer.ts/macd-analyzer.ts).
export function analyze(history: any[], currentPrice: number) {
  const empty = {
    label: 'Bollinger Bands (20,2)', value: 'N/A', decision: 'NEUTRAL', confidence: 0,
    raw: { middle: null as number | null, upper: null as number | null, lower: null as number | null, percentB: null as number | null },
  };
  if (!Array.isArray(history) || history.length < BOLLINGER_PERIOD) return empty;

  const closes = history.map((h) => (typeof h.AdjClose === 'number' && Number.isFinite(h.AdjClose) && h.AdjClose > 0 ? h.AdjClose : null));
  if (closes.some((c) => c == null)) {
    return { ...empty, value: 'N/A (MISSING_ADJUSTED_PRICE)' };
  }

  const bb = calculateBollingerBands(closes as number[], currentPrice);
  if (!bb) return empty;

  // Lebar band nol (seluruh harga jendela identik) -> %B tidak terdefinisi, jadi tidak
  // ada posisi relatif yang bisa dinilai. Bandnya sendiri tetap dilaporkan apa adanya;
  // yang tidak dilakukan adalah MENYIMPULKAN arah dari angka yang tidak ada.
  if (bb.percentB == null) {
    return {
      label: 'Bollinger Bands (20,2)',
      value: `Upper: ${bb.upper.toFixed(0)}, Middle: ${bb.middle.toFixed(0)}, Lower: ${bb.lower.toFixed(0)} (%B: N/A - lebar band nol)`,
      decision: 'NEUTRAL',
      confidence: 0,
      raw: { middle: bb.middle, upper: bb.upper, lower: bb.lower, percentB: null },
    };
  }

  const percentB = bb.percentB;
  let decision = 'NEUTRAL';
  let confidence = 50;

  // Sentuh/lewat upper band -> rawan pullback (BEARISH); sentuh/lewat lower band -> area
  // jenuh jual (BULLISH). Konsisten dengan interpretasi Bollinger Band baku (John
  // Bollinger) dan dengan Bollinger Agent lama di lib/miniCouncil.ts.
  if (percentB >= 1) {
    decision = 'BEARISH';
    confidence = Math.round(Math.min(95, 70 + (percentB - 1) * 50));
  } else if (percentB <= 0) {
    decision = 'BULLISH';
    confidence = Math.round(Math.min(95, 70 + (0 - percentB) * 50));
  } else {
    // Di dalam band: makin dekat ke salah satu sisi, makin condong ke arah itu.
    const distanceFromMid = Math.abs(percentB - 0.5) * 2; // 0 (tengah) .. 1 (di tepi band)
    confidence = Math.round(50 + distanceFromMid * 20);
    decision = percentB > 0.5 ? 'BEARISH' : percentB < 0.5 ? 'BULLISH' : 'NEUTRAL';
  }

  return {
    label: 'Bollinger Bands (20,2)',
    value: `Upper: ${bb.upper.toFixed(0)}, Middle: ${bb.middle.toFixed(0)}, Lower: ${bb.lower.toFixed(0)} (%B: ${percentB.toFixed(2)})`,
    decision,
    confidence,
    raw: { middle: bb.middle, upper: bb.upper, lower: bb.lower, percentB },
  };
}
