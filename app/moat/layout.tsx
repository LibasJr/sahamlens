import type { Metadata } from 'next';

// Layout tipis HANYA untuk metadata. `app/moat/page.tsx` adalah komponen
// 'use client', dan komponen client TIDAK BISA mengekspor `metadata` - Next
// mengabaikannya tanpa peringatan. Tanpa berkas ini halaman mewarisi metadata
// root; sebelum perbaikan ini warisan itu memasang canonical ke beranda,
// sehingga halaman tidak pernah layak diindeks atas namanya sendiri.
export const metadata: Metadata = {
  title: 'Analisa Moat & Keunggulan Kompetitif',
  description: 'Ukur daya tahan keunggulan bisnis emiten IDX lewat konsistensi margin, return on capital, dan posisi pasar.',
  alternates: { canonical: '/moat' },
};

export default function MoatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
