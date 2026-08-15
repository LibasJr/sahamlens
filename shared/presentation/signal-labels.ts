/**
 * Presentation-only vocabulary for classifier output.
 *
 * KENAPA FILE INI ADA: `scoring.service.ts` (ScoringKategori) dan `consensus.service.ts`
 * (ConsensusResult.kategori) mengeluarkan 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' |
 * 'STRONG SELL' - vokabular itu BENAR untuk backtest/klasifikasi/threshold internal
 * (dipertahankan apa adanya di sana, lihat catatan di scoring.service.ts &
 * consensus.service.ts). Tapi begitu string yang sama dirender langsung ke pengguna, ia
 * terbaca sebagai ajakan transaksi ("BUY" di layar HP terlihat seperti tombol beli),
 * padahal `modules/eligibility` sudah fail-closed: model belum tervalidasi backtest
 * out-of-sample, jadi TIDAK ADA rekomendasi transaksi yang boleh dikirim.
 *
 * Aturan main: kode yang MENGHITUNG (scoring, consensus, threshold, eligibility,
 * advisory, backtest, calibration) TIDAK diubah oleh file ini sama sekali. File ini
 * hanya menerjemahkan hasilnya untuk ditampilkan.
 */

export type SignalKategori = 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL';

const KATEGORI_LABEL: Record<SignalKategori, string> = {
  'STRONG BUY': 'SINYAL SANGAT POSITIF',
  BUY: 'SINYAL POSITIF',
  HOLD: 'NETRAL / PANTAU',
  SELL: 'SINYAL NEGATIF',
  'STRONG SELL': 'SINYAL SANGAT NEGATIF',
};

/**
 * Petakan kategori classifier ke label yang aman ditampilkan ke pengguna. String yang
 * tidak dikenali (mis. 'DATA TIDAK CUKUP', null) dikembalikan apa adanya - fungsi ini
 * TIDAK menebak makna kategori yang tidak ada di peta.
 */
export function getKategoriPresentationLabel(kategori: string | null | undefined): string {
  if (!kategori) return 'TIDAK TERSEDIA';
  return KATEGORI_LABEL[kategori as SignalKategori] ?? kategori;
}

/** Warna kategori = indikasi arah (positif/netral/negatif), BUKAN tombol CTA beli/jual. */
export type KategoriTone = 'positive' | 'negative' | 'neutral';

export function getKategoriTone(kategori: string | null | undefined): KategoriTone {
  if (!kategori) return 'neutral';
  if (kategori.includes('BUY')) return 'positive';
  if (kategori.includes('SELL')) return 'negative';
  return 'neutral';
}

/**
 * Arah per-analyzer individual (mis. RSI, MA Trend) dipetakan dari BULLISH/BEARISH/
 * NEUTRAL ke BUY/SELL/HOLD murni untuk keperluan pewarnaan & vote counting internal
 * (lihat `sinyalDariAnalyzer` di app/technical/[symbol]/page.tsx). Untuk TEKS yang
 * dirender, kata kerja transaksi BUY/SELL diganti kata sifat arah BULLISH/BEARISH -
 * bedanya penting: "BUY" adalah ajakan, "BULLISH" adalah pernyataan arah data.
 */
const ANALYZER_DIRECTION_LABEL: Record<string, string> = {
  BUY: 'BULLISH',
  SELL: 'BEARISH',
  HOLD: 'NETRAL',
  WAIT: 'NETRAL',
};

export function getAnalyzerDirectionLabel(direction: string | null | undefined): string {
  if (!direction) return 'NETRAL';
  return ANALYZER_DIRECTION_LABEL[direction] ?? direction;
}
