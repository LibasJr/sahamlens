// Paket harga Pro - satu titik dokumentasi (sebelumnya cuma ada 1 paket bulanan
// Rp99.000 tanpa pilihan durasi lain, di-hardcode terpisah di teks WhatsApp default
// PaywallModal). Permintaan eksplisit: tambah paket 3/6/12 bulan, harga = harga
// bulanan x jumlah bulan, dipotong diskon per paket (5%/8%/10%).
export const MONTHLY_PRICE = 99_000;

export interface PricingPlan {
  id: '1m' | '3m' | '6m' | '12m';
  label: string;
  months: number;
  discountPct: number;
  /** Harga total kalau bayar bulanan berkali-kali (bukan harga per bulan) - dipakai
   * sebagai referensi dicoret di UI. */
  normalPrice: number;
  /** Harga yang sebenarnya dibayar setelah diskon paket. */
  finalPrice: number;
  /** Setara harga per bulan setelah diskon - buat perbandingan antar paket. */
  pricePerMonth: number;
  badge?: string;
}

function buildPlan(id: PricingPlan['id'], label: string, months: number, discountPct: number, badge?: string): PricingPlan {
  const normalPrice = MONTHLY_PRICE * months;
  const finalPrice = Math.round(normalPrice * (1 - discountPct / 100));
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
  buildPlan('1m', '1 Bulan', 1, 0),
  buildPlan('3m', '3 Bulan', 3, 5),
  buildPlan('6m', '6 Bulan', 6, 8, 'Populer'),
  buildPlan('12m', '1 Tahun', 12, 10, 'Paling Hemat'),
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
  'Council AI - 10 agen analisis per saham',
  'Multi-Agent Orchestrator - 9 agen kuantitatif',
  'Compare Tool - bandingkan 2 saham berdampingan',
  'Stock Screener - filter multi-faktor',
  'AI Pick LIVE - breakout, golden cross, rekomendasi harian',
  'Backtest - simulasi strategi dari data historis',
  'DCF Intrinsic Valuation',
  'Dividend Compounding Planner',
  'Risk Matrix & Stress Testing (beta portofolio riil)',
  'Risk Calculator - position sizing & risk/reward',
  'Watchlist & Alert unlimited (Telegram)',
  'Corporate Calendar - dividen & earnings',
  'Akun Demo - paper trading unlimited',
];
