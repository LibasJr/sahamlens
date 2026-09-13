import type { Metadata } from 'next';

// Layout tipis HANYA untuk metadata. `app/fundamental/page.tsx` adalah komponen
// 'use client', dan komponen client TIDAK BISA mengekspor `metadata` - Next
// mengabaikannya tanpa peringatan. Tanpa berkas ini halaman mewarisi metadata
// root; sebelum perbaikan ini warisan itu memasang canonical ke beranda,
// sehingga halaman tidak pernah layak diindeks atas namanya sendiri.
export const metadata: Metadata = {
  title: 'Analisa Fundamental Saham IDX',
  description: 'Rasio keuangan, kualitas laba, dan kesehatan neraca emiten IDX dari laporan keuangan resmi.',
  alternates: { canonical: '/fundamental' },
};

export default function FundamentalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
