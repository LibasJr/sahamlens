// Paket harga Pro - satu titik dokumentasi (sebelumnya cuma ada 1 paket bulanan
// Rp99.000 tanpa pilihan durasi lain, di-hardcode terpisah di teks WhatsApp default
// PaywallModal). Permintaan eksplisit: tambah paket 3/6/12 bulan.
//
// Harga FINAL tiap paket adalah angka bulat eksplisit (bukan hasil murni harga
// bulanan x diskon %) - 1 Bulan Rp99.000, 3 Bulan Rp285.000, 6 Bulan Rp525.000,
// 1 Tahun Rp990.000. `discountPct` DIHITUNG MUNDUR dari harga final ini (bukan
// sumber kebenaran harga) supaya badge "Hemat X%" yang ditampilkan selalu cocok
// dengan angka rupiah yang sebenarnya dibayar - tidak ada dua angka yang bisa
// saling tidak sinkron.
export const MONTHLY_PRICE = 99_000;

export interface PricingPlan {
  id: '1m' | '3m' | '6m' | '12m';
  label: string;
  months: number;
  /** Dihitung mundur dari finalPrice vs normalPrice, dibulatkan - lihat catatan di atas. */
  discountPct: number;
  /** Harga total kalau bayar bulanan berkali-kali (bukan harga per bulan) - dipakai
   * sebagai referensi dicoret di UI. */
  normalPrice: number;
  /** Harga yang sebenarnya dibayar - SUMBER KEBENARAN, angka bulat eksplisit. */
  finalPrice: number;
  /** Setara harga per bulan setelah diskon - buat perbandingan antar paket. */
  pricePerMonth: number;
  badge?: string;
}

function buildPlan(id: PricingPlan['id'], label: string, months: number, finalPrice: number, badge?: string): PricingPlan {
  const normalPrice = MONTHLY_PRICE * months;
  const discountPct = normalPrice > 0 ? Math.round((1 - finalPrice / normalPrice) * 100) : 0;
  return {
    id,
    label,
    months,
    discountPct,
    normalPrice,
    finalPrice,
    pricePerMonth: Math.round(finalPrice / months),
    badge,
  };
}

export const PRICING_PLANS: PricingPlan[] = [
  buildPlan('1m', '1 Bulan', 1, MONTHLY_PRICE),
  buildPlan('3m', '3 Bulan', 3, 285_000),
  buildPlan('6m', '6 Bulan', 6, 525_000, 'Populer'),
  buildPlan('12m', '1 Tahun', 12, 990_000, 'Paling Hemat'),
];

export function formatRupiah(n: number): string {
  return `Rp${n.toLocaleString('id-ID')}`;
}

// Daftar fitur lengkap aplikasi (disamakan dengan menu Sidebar) - dipakai PaywallModal
// supaya modal upgrade menampilkan SEMUA yang didapat, bukan cuma teaser 3 baris yang
// diulang identik di ~10 halaman berbeda.
export const FULL_FEATURE_LIST: string[] = [
  'Technical Analyzer - 10 filter murni matematika',
  'Fundamental Analyzer - valuasi & kesehatan keuangan',
  'LensAI - 10 agen analisis per saham',
  'Multi-Agent Orchestrator - 9 agen kuantitatif',
  'Compare Tool - bandingkan 2 saham berdampingan',
  'Stock Screener - filter multi-faktor',
  'AI Pick LIVE - breakout, golden cross, rekomendasi harian',
  'Backtest - simulasi strategi dari 9 filter teknikal (kombinasi bebas/preset) atas data historis riil, lengkap win rate, return, alpha vs IHSG & max drawdown',
  'DCF Intrinsic Valuation',
  'Dividend Compounding Planner',
  'Risk Matrix & Stress Testing (beta portofolio riil)',
  'Risk Calculator - position sizing & risk/reward',
  'Watchlist & Alert unlimited - notifikasi Telegram real-time untuk harga turun/naik dari target, RSI oversold, & konsensus STRONG BUY',
  'Corporate Calendar - dividen & earnings',
  'Akun Demo - paper trading unlimited',
];
