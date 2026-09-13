import type { Metadata } from 'next';

// Layout tipis HANYA untuk metadata. `app/screener/page.tsx` adalah komponen
// 'use client', dan komponen client TIDAK BISA mengekspor `metadata` - Next
// mengabaikannya tanpa peringatan. Tanpa berkas ini halaman mewarisi metadata
// root; sebelum perbaikan ini warisan itu memasang canonical ke beranda,
// sehingga halaman tidak pernah layak diindeks atas namanya sendiri.
export const metadata: Metadata = {
  title: 'Screener Saham IDX',
  description: 'Saring saham IDX memakai skor teknikal, fundamental, dan arus dana dari rumus terbuka. Filter likuiditas, sektor, dan momentum untuk mempersempit kandidat riset.',
  alternates: { canonical: '/screener' },
};

export default function ScreenerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
