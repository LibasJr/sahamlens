// BUG FIX (audit kuantitatif 2026-08-19, temuan M-04): LABEL SALAH DUA KALI.
//
// `defaultKeyStatistics.earningsQuarterlyGrowth` dari Yahoo adalah pertumbuhan LABA
// kuartalan YEAR-OVER-YEAR (kuartal terakhir vs kuartal yang sama tahun lalu). Label
// lama berbunyi "EPS Growth (QoQ)" - keliru pada kedua bagiannya:
//
//   - "EPS"  : ini pertumbuhan laba total, TIDAK dinormalisasi terhadap jumlah saham
//              beredar. Right issue atau buyback tidak tercermin sama sekali, padahal
//              justru itu yang membedakan pertumbuhan laba dari pertumbuhan laba PER
//              SAHAM bagi pemegang saham.
//   - "QoQ"  : pembandingnya kuartal yang sama tahun lalu, bukan kuartal sebelumnya.
//              Pembaca yang mengira ini QoQ akan menyimpulkan momentum kuartal terakhir
//              dari angka yang sebenarnya sudah menyaring musiman setahun penuh.
//
// Nilainya tidak diubah - yang salah memang namanya, bukan angkanya. Kalau kelak EPS
// growth yang sesungguhnya dibutuhkan, turunkan dari deret EPS di
// modules/fundamental/repository/fundamental-history.repository.ts yang sudah menyimpan
// riwayat per periode.
export function analyze(data: any) {
  const growth = data?.defaultKeyStatistics?.earningsQuarterlyGrowth;
  const label = 'Pertumbuhan Laba (YoY, kuartalan)';
  if (typeof growth !== 'number' || !Number.isFinite(growth)) {
    return { label, value: 'N/A', decision: 'NEUTRAL', confidence: 0 };
  }

  const growthPct = growth * 100;
  let decision = 'NEUTRAL';
  let confidence = 50;

  if (growthPct > 10) {
    decision = 'BULLISH';
    confidence = Math.min(99, 60 + growthPct);
  } else if (growthPct < 0) {
    decision = 'BEARISH';
    confidence = Math.min(99, 60 + Math.abs(growthPct));
  } else {
    confidence = 60;
  }

  return { label, value: `${growthPct.toFixed(2)}%`, decision, confidence: Math.round(confidence) };
}
