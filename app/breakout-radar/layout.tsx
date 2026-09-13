import type { Metadata } from 'next';

// Layout tipis HANYA untuk metadata. `app/breakout-radar/page.tsx` adalah komponen
// 'use client', dan komponen client TIDAK BISA mengekspor `metadata` - Next
// mengabaikannya tanpa peringatan. Tanpa berkas ini halaman mewarisi metadata
// root; sebelum perbaikan ini warisan itu memasang canonical ke beranda,
// sehingga halaman tidak pernah layak diindeks atas namanya sendiri.
export const metadata: Metadata = {
  title: 'Radar Breakout Saham IDX',
  description: 'Pantau saham IDX yang sedang menembus level teknikal penting, lengkap dengan konteks volume, momentum, dan kualitas sinyal.',
  alternates: { canonical: '/breakout-radar' },
};

export default function BreakoutRadarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
