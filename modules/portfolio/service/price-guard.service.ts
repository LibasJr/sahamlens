import YahooFinanceClass from 'yahoo-finance2';

// Penjaga harga transaksi portofolio virtual (audit logika & algoritma 2026-08-05,
// temuan H-11).
//
// SEBELUMNYA `price` pada POST /api/portfolio/buy|sell (dan /api/v1/portfolio/
// transactions) diterima apa adanya dari client - validator hanya memastikan angkanya
// positif & finite. Artinya siapa pun bisa mengirim `{"symbol":"BBCA","price":1,
// "lots":1000}` dan seluruh angka turunan portofolio (nilai posisi, P/L realisasi,
// Portfolio Health) menjadi hasil rekayasa, bukan cerminan pasar. Untuk aplikasi yang
// seluruh premisnya "angka yang ditampilkan berasal dari data nyata", celah ini membuat
// satu bagian aplikasi bisa menampilkan angka finansial yang tidak berdasar sama sekali.
//
// Aturan: harga transaksi harus berada dalam koridor wajar terhadap harga pasar terakhir.
// Toleransinya sengaja LONGGAR (bukan harga persis) karena ini portofolio simulasi -
// pengguna berhak mencatat entry di harga intraday yang berbeda dari last price, dan
// data Yahoo sendiri delayed ~15 menit. Yang ditolak adalah harga yang secara nyata di
// luar akal untuk saham itu.

const yahooFinance = new (YahooFinanceClass as any)({ suppressNotices: ['yahooSurvey'] });

/** Batas atas & bawah relatif terhadap harga pasar terakhir. IDX sendiri menerapkan
 * auto-rejection kira-kira di kisaran ini per hari; 35% memberi ruang lebih dari cukup
 * untuk saham volatil sekaligus tetap menutup angka yang jelas-jelas dikarang. */
const MAX_DEVIATION = 0.35;

export interface PriceCheck {
  ok: boolean;
  marketPrice: number | null;
  reason?: string;
}

/**
 * Verifikasi harga transaksi terhadap harga pasar terakhir.
 *
 * Kalau harga pasar TIDAK bisa diambil (Yahoo down / simbol tidak dikenal), transaksi
 * TETAP diizinkan - memblokir pengguna karena penyedia data sedang bermasalah lebih
 * merugikan daripada risiko yang ditutup. Yang penting: sistem tidak lagi menerima harga
 * apa pun tanpa pernah memeriksanya sama sekali.
 */
export async function verifyTradePrice(symbol: string, price: number): Promise<PriceCheck> {
  const ticker = symbol.toUpperCase().includes('.') ? symbol.toUpperCase() : `${symbol.toUpperCase()}.JK`;
  let marketPrice: number | null = null;
  try {
    const quote = await Promise.race([
      yahooFinance.quote(ticker),
      new Promise((_, reject) => setTimeout(() => reject(new Error('quote timeout')), 5000)),
    ]);
    const p = (quote as any)?.regularMarketPrice;
    if (typeof p === 'number' && p > 0) marketPrice = p;
  } catch {
    marketPrice = null;
  }

  if (marketPrice == null) return { ok: true, marketPrice: null };

  const deviation = Math.abs(price - marketPrice) / marketPrice;
  if (deviation > MAX_DEVIATION) {
    return {
      ok: false,
      marketPrice,
      reason: `Harga ${price.toLocaleString('id-ID')} menyimpang ${(deviation * 100).toFixed(0)}% dari harga pasar terakhir ${marketPrice.toLocaleString('id-ID')} untuk ${ticker}. Portofolio virtual tetap harus memakai harga yang wajar supaya P/L-nya berarti.`,
    };
  }
  return { ok: true, marketPrice };
}
