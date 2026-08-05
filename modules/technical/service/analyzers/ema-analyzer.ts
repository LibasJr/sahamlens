// BUG FIX (audit integritas data 2026-08-03, temuan M-03): `raw` (angka asli) disediakan
// supaya pemanggil (app/api/council/route.ts) tidak perlu parse string `value`.
export function analyze(history: any[], currentPrice: number) {
  if (history.length < 50) return { label: 'EMA 20/50 Cross', value: 'N/A', decision: 'NEUTRAL', confidence: 0, raw: { ema20: null as number | null, ema50: null as number | null } };

  // FASE 3: EMA return-based memakai adjusted close eksplisit. Tidak boleh fallback
  // ke Close karena itu mencampur basis harga di tengah seri.
  const closes = history.map(h => typeof h.AdjClose === 'number' && Number.isFinite(h.AdjClose) && h.AdjClose > 0 ? h.AdjClose : null);
  if (closes.some((close) => close == null)) {
    return { label: 'EMA 20/50 Cross', value: 'N/A (MISSING_ADJUSTED_PRICE)', decision: 'NEUTRAL', confidence: 0, raw: { ema20: null as number | null, ema50: null as number | null } };
  }
  const ema20 = calculateEMA(closes as number[], 20);
  const ema50 = calculateEMA(closes as number[], 50);

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
    confidence: Math.round(confidence),
    raw: { ema20: lastEMA20, ema50: lastEMA50 },
  };
}

// EMA baku: di-seed dengan SMA periode pertama, bukan harga pertama.
//
// BUG FIX (audit logika & algoritma 2026-08-05, temuan L-3): implementasi lama memulai
// deret dengan `ema[0] = prices[0]` - satu harga tunggal sebagai titik awal rata-rata
// bergerak. Efeknya mengecil seiring bertambahnya bar (bobot awal meluruh eksponensial)
// dan pada 200 bar praktis hilang, tapi untuk deret pendek - dan untuk MACD, yang
// meng-EMA-kan hasil EMA sehingga bias awalnya bertumpuk - hasilnya menyimpang dari EMA
// yang dilihat pengguna di platform lain. Seed SMA adalah definisi yang dipakai
// TradingView/Stockbit dkk.
function calculateEMA(prices: number[], period: number) {
  if (prices.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [];
  if (prices.length < period) {
    // Bar belum cukup untuk seed SMA - kembalikan deret dari harga pertama seperti
    // sebelumnya; pemanggil sudah menjaga panjang minimum sebelum memakai hasilnya.
    ema.push(prices[0]);
    for (let i = 1; i < prices.length; i++) ema.push(prices[i] * k + ema[i - 1] * (1 - k));
    return ema;
  }
  const seed = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  // Indeks 0..period-2 diisi seed supaya panjang array tetap sama dengan `prices`
  // (pemanggil mengambil elemen terakhir & memetakan per indeks).
  for (let i = 0; i < period - 1; i++) ema.push(seed);
  ema.push(seed);
  for (let i = period; i < prices.length; i++) ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  return ema;
}
