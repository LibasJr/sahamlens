import type { Metadata } from 'next';

// Layout tipis HANYA untuk metadata. `app/backtest/page.tsx` adalah komponen
// 'use client', dan komponen client TIDAK BISA mengekspor `metadata` - Next
// mengabaikannya tanpa peringatan. Tanpa berkas ini halaman mewarisi metadata
// root; sebelum perbaikan ini warisan itu memasang canonical ke beranda,
// sehingga halaman tidak pernah layak diindeks atas namanya sendiri.
export const metadata: Metadata = {
  title: 'Backtest Strategi Saham IDX',
  description: 'Uji strategi trading dan investasi pada data historis saham IDX sebelum memakai modal sungguhan.',
  alternates: { canonical: '/backtest' },
};

export default function BacktestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
