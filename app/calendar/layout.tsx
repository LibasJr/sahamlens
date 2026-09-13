import type { Metadata } from 'next';

// Layout tipis HANYA untuk metadata. `app/calendar/page.tsx` adalah komponen
// 'use client', dan komponen client TIDAK BISA mengekspor `metadata` - Next
// mengabaikannya tanpa peringatan. Tanpa berkas ini halaman mewarisi metadata
// root; sebelum perbaikan ini warisan itu memasang canonical ke beranda,
// sehingga halaman tidak pernah layak diindeks atas namanya sendiri.
export const metadata: Metadata = {
  title: 'Kalender Korporasi Emiten IDX',
  description: 'Jadwal aksi korporasi emiten IDX: dividen, RUPS, laporan keuangan, dan tanggal penting lain untuk perencanaan posisi.',
  alternates: { canonical: '/calendar' },
};

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
