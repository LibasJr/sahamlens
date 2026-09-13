import type { Metadata } from 'next';

// Layout tipis HANYA untuk metadata. `app/news/page.tsx` adalah komponen
// 'use client', dan komponen client TIDAK BISA mengekspor `metadata` - Next
// mengabaikannya tanpa peringatan. Tanpa berkas ini halaman mewarisi metadata
// root; sebelum perbaikan ini warisan itu memasang canonical ke beranda,
// sehingga halaman tidak pernah layak diindeks atas namanya sendiri.
export const metadata: Metadata = {
  title: 'Berita & Sentimen Saham IDX',
  description: 'Berita pasar saham Indonesia dengan konteks sentimen dan kaitannya ke emiten yang sedang Anda riset.',
  alternates: { canonical: '/news' },
};

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
