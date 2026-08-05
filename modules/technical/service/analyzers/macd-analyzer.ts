// BUG FIX (audit integritas data 2026-08-03, temuan M-03): sama seperti rsi-analyzer.ts
// - pemanggil sebelumnya mem-parse macdLine/macdSignal/macdHist dari string `value`
// pakai regex (`/MACD: ([\-\d.]+), Sig: ([\-\d.]+), Hist: ([\-\d.]+)/`). Kalau regex
// tidak match (mis. format berubah), kegagalan DIAM-DIAM menghasilkan 0/0/0 yang masuk
// ke scoring sebagai "MACD bearish" - bukan error yang terlihat. `raw` (angka asli)
// disediakan supaya pemanggil tidak perlu regex sama sekali.
export function analyze(history: any[], currentPrice: number) {
  if (history.length < 35) return { label: 'MACD', value: 'N/A', decision: 'NEUTRAL', confidence: 0, raw: { macdLine: null as number | null, macdSignal: null as number | null, macdHist: null as number | null } };

  // FASE 3: MACD return-based memakai adjusted close eksplisit. Missing adjusted price
  // membuat indikator N/A, bukan fallback diam-diam ke raw Close.
  const closes = history.map(h => typeof h.AdjClose === 'number' && Number.isFinite(h.AdjClose) && h.AdjClose > 0 ? h.AdjClose : null);
  if (closes.some((close) => close == null)) {
    return { label: 'MACD', value: 'N/A (MISSING_ADJUSTED_PRICE)', decision: 'NEUTRAL', confidence: 0, raw: { macdLine: null as number | null, macdSignal: null as number | null, macdHist: null as number | null } };
  }
  const ema12 = calculateEMA(closes as number[], 12);
  const ema26 = calculateEMA(closes as number[], 26);
  
  const macdLine = ema12.map((val, i) => val - ema26[i]);
  const signalLine = calculateEMA(macdLine, 9);

  const lastMacd = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  const histogram = lastMacd - lastSignal;

  let decision = 'NEUTRAL';
  let confidence = 50;

  // IDX Threshold: BUY = histogram > 0 DAN MACD line > Signal
  if (histogram > 0 && lastMacd > lastSignal) {
    decision = 'BULLISH';
    confidence = Math.min(95, 60 + (histogram / (closes[closes.length - 1] as number)) * 1000);
  } else if (histogram < 0 && lastMacd < lastSignal) {
    decision = 'BEARISH';
    confidence = Math.min(95, 60 + (Math.abs(histogram) / (closes[closes.length - 1] as number)) * 1000);
  }

  return {
    label: 'MACD (12,26,9)',
    value: `MACD: ${lastMacd.toFixed(2)}, Sig: ${lastSignal.toFixed(2)}, Hist: ${histogram.toFixed(2)}`,
    decision,
    confidence: Math.round(confidence),
    raw: { macdLine: lastMacd, macdSignal: lastSignal, macdHist: histogram },
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
