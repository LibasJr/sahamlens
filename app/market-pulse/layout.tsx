import type { Metadata } from 'next';

// Layout tipis HANYA untuk metadata. `app/market-pulse/page.tsx` adalah komponen
// 'use client', dan komponen client TIDAK BISA mengekspor `metadata` - Next
// mengabaikannya tanpa peringatan. Tanpa berkas ini halaman mewarisi metadata
// root; sebelum perbaikan ini warisan itu memasang canonical ke beranda,
// sehingga halaman tidak pernah layak diindeks atas namanya sendiri.
export const metadata: Metadata = {
  title: 'Konteks Pasar & Breadth IDX',
  description: 'Ringkasan kondisi pasar saham Indonesia: breadth, sektor penggerak, arus dana asing, dan sinyal risiko harian.',
  alternates: { canonical: '/market-pulse' },
};

export default function MarketPulseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
