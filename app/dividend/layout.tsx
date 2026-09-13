import type { Metadata } from 'next';

// Layout tipis HANYA untuk metadata. `app/dividend/page.tsx` adalah komponen
// 'use client', dan komponen client TIDAK BISA mengekspor `metadata` - Next
// mengabaikannya tanpa peringatan. Tanpa berkas ini halaman mewarisi metadata
// root; sebelum perbaikan ini warisan itu memasang canonical ke beranda,
// sehingga halaman tidak pernah layak diindeks atas namanya sendiri.
export const metadata: Metadata = {
  title: 'Analisa Dividen Saham IDX',
  description: 'Riwayat dividen, yield, rasio pembayaran, dan konsistensi distribusi emiten IDX.',
  alternates: { canonical: '/dividend' },
};

export default function DividendLayout({ children }: { children: React.ReactNode }) {
  return children;
}
