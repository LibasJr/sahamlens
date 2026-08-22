// On-Balance Volume (Joseph Granville, 1963) - kumulatif: +volume kalau harga naik dari
// bar sebelumnya, -volume kalau turun, tidak berubah kalau flat.
//
// Basis harga: AdjClose (bukan raw Close) untuk menentukan arah naik/turun - split atau
// dividen pada raw Close bisa menciptakan hari "turun/naik" palsu yang sebenarnya cuma
// penyesuaian harga, bukan pergerakan pasar sungguhan (alasan yang sama dengan RSI/MACD
// - lihat catatan FASE 3 di rsi-analyzer.ts). Volume itu sendiri tidak disesuaikan -
// jumlah lembar yang berpindah tangan tidak berubah oleh split/dividen.
export interface ObvBar {
  adjClose: number;
  volume: number;
}

/**
 * Seluruh deret OBV, mulai dari 0 (definisi Granville: OBV bar pertama = 0, bukan
 * volume bar itu sendiri - tidak ada bar sebelumnya untuk dibandingkan arahnya).
 *
 * `null` kalau ADA SATU SAJA bar dengan adjClose/volume yang tidak terhingga.
 * FAIL-CLOSED, dan di sini taruhannya paling besar dari semua indikator: OBV
 * MENJUMLAHKAN volume secara kumulatif, jadi satu volume yang dianggap 0 padahal
 * sebenarnya hilang akan menggeser SELURUH deret sesudahnya secara permanen - garis yang
 * tampil tetap mulus dan meyakinkan, tanpa satu pun tanda bahwa angkanya salah.
 */
export function calculateObvSeries(bars: ObvBar[]): number[] | null {
  if (!Array.isArray(bars) || bars.length === 0) return null;
  if (bars.some((b) => !Number.isFinite(b?.adjClose) || !Number.isFinite(b?.volume))) return null;
  const out: number[] = [0];
  for (let i = 1; i < bars.length; i++) {
    const prev = out[i - 1]!;
    const curr = bars[i]!;
    const prior = bars[i - 1]!;
    if (curr.adjClose > prior.adjClose) out.push(prev + curr.volume);
    else if (curr.adjClose < prior.adjClose) out.push(prev - curr.volume);
    else out.push(prev);
  }
  return out;
}

/** Selisih OBV antara bar terakhir dan `lookback` bar sebelumnya - dipakai sebagai
 * sinyal akumulasi (positif)/distribusi (negatif). `null` kalau deret tidak cukup. */
export function obvSlope(series: number[], lookback = 10): number | null {
  if (!Array.isArray(series) || series.length < lookback + 1) return null;
  const last = series[series.length - 1]!;
  const before = series[series.length - 1 - lookback]!;
  if (!Number.isFinite(last) || !Number.isFinite(before)) return null;
  return last - before;
}
