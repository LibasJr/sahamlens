// Proxy arus dana harian dari data harga+volume Yahoo Finance yang SUDAH real (BUKAN
// data broker/asing resmi - IDX tidak menyediakan feed broker summary gratis). Dipakai
// bersama oleh /api/flow/[ticker] (Bandar & Foreign Flow) dan market-summary.service.ts
// (kategori "Akumulasi Asing Berkelanjutan" di AI Pick) - satu definisi, bukan dua logika
// berbeda yang bisa saling tidak konsisten.
//
// Sebelumnya /api/flow/[ticker] memakai seedRandom(ticker) murni - angka acak yang
// SELALU SAMA untuk ticker yang sama, tidak pernah benar-benar mencerminkan pergerakan
// pasar. Diganti total (2026-08-01) jadi dihitung dari histori harga/volume asli.

export type DailyFlowPoint = { date: string; netValueBillion: number };

/** Hari harga naik -> netValue positif (tekanan beli), hari turun -> negatif (tekanan
 * jual). Besaran = volume x harga penutupan (nilai transaksi harian dalam miliar Rupiah). */
export function computeDailyNetFlow(
  history: { date: string; close: number; volume: number }[],
): DailyFlowPoint[] {
  const points: DailyFlowPoint[] = [];
  for (let i = 1; i < history.length; i++) {
    const change = history[i].close - history[i - 1].close;
    const valueBillion = (history[i].volume * history[i].close) / 1_000_000_000;
    points.push({
      date: history[i].date,
      netValueBillion: parseFloat((change >= 0 ? valueBillion : -valueBillion).toFixed(2)),
    });
  }
  return points;
}

/** Jumlah hari berturut-turut (dari yang paling baru mundur ke belakang) netValue
 * positif - "akumulasi berkelanjutan". 0 kalau hari terakhir sudah negatif/nol. */
export function computeAccumulationStreak(daily: DailyFlowPoint[]): number {
  let streak = 0;
  for (let i = daily.length - 1; i >= 0; i--) {
    if (daily[i].netValueBillion > 0) streak++;
    else break;
  }
  return streak;
}
