import type { Metadata } from 'next';

// Layout tipis HANYA untuk metadata. `app/dcf/page.tsx` adalah komponen
// 'use client', dan komponen client TIDAK BISA mengekspor `metadata` - Next
// mengabaikannya tanpa peringatan. Tanpa berkas ini halaman mewarisi metadata
// root; sebelum perbaikan ini warisan itu memasang canonical ke beranda,
// sehingga halaman tidak pernah layak diindeks atas namanya sendiri.
export const metadata: Metadata = {
  title: 'Valuasi Saham DCF & Nilai Wajar',
  description: 'Hitung nilai wajar saham IDX dengan discounted cash flow, lengkap dengan asumsi yang bisa Anda ubah sendiri.',
  alternates: { canonical: '/dcf' },
};

export default function DcfLayout({ children }: { children: React.ReactNode }) {
  return children;
}
