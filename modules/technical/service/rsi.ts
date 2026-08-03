// RSI (Relative Strength Index) - satu implementasi baku Wilder smoothing, dipakai oleh
// SEMUA pemanggil RSI di aplikasi ini (rsi-analyzer.ts, market-summary.service.ts,
// breakout.service.ts, lib/miniCouncil.ts).
//
// BUG FIX (audit integritas data 2026-08-03, temuan H-01): keempat file di atas
// sebelumnya masing-masing menghitung RSI dengan RATA-RATA ARITMATIK SEDERHANA dari 14
// selisih terakhir - BUKAN smoothing Wilder (J. Welles Wilder, 1978) yang menjadi
// definisi baku RSI dan dipakai TradingView/Stockbit/RTI/dst. Diverifikasi empiris
// (Yahoo Finance, 243 bar, 2026-08-03) selisihnya signifikan dan bias searah:
//   BBCA  rata-rata sederhana 56.52  vs Wilder 51.89  (+4.63)
//   BBRI  rata-rata sederhana 68.42  vs Wilder 56.57  (+11.85)
// RSI yang bias ke atas ini dipakai untuk scoring (BUY/SELL threshold), ranking
// "RSI Oversold" di halaman utama, dan sinyal breakout - hasilnya menyimpang dari RSI
// yang dilihat pengguna di platform lain untuk saham yang sama. Selain itu keempat
// implementasi lama saling berbeda tipis (mis. `diff > 0` vs `diff >= 0`, penanganan
// `losses === 0` yang tidak konsisten), sehingga saham yang sama bisa menampilkan RSI
// berbeda di halaman Detail Saham vs Ringkasan Pasar vs AI Pick - sekarang satu fungsi,
// satu hasil di mana pun dipanggil.
export function calculateRsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  // Seed: rata-rata gain/loss dari `period` selisih pertama.
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += -diff;
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder smoothing (RMA) untuk sisa data - avg baru = (avg lama x (period-1) + nilai
  // hari ini) / period. Ini yang membedakan Wilder dari rata-rata aritmatik sederhana:
  // setiap hari ikut mempengaruhi rata-rata secara eksponensial-menurun, bukan cuma
  // 14 hari terakhir dihitung ulang dari nol.
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}
