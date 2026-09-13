import type { Metadata } from 'next';

// Layout tipis HANYA untuk metadata. `app/about/page.tsx` adalah komponen
// 'use client', dan komponen client TIDAK BISA mengekspor `metadata` - Next
// mengabaikannya tanpa peringatan. Tanpa berkas ini halaman mewarisi metadata
// root; sebelum perbaikan ini warisan itu memasang canonical ke beranda,
// sehingga halaman tidak pernah layak diindeks atas namanya sendiri.
export const metadata: Metadata = {
  title: 'Tentang SahamLens',
  description: 'Siapa di balik SahamLens, untuk siapa alat ini dibuat, dan prinsip yang dipakai dalam menyusun skor serta analisa saham IDX.',
  alternates: { canonical: '/about' },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
