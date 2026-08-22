import { redirect } from 'next/navigation';
import { isAdminServer } from '@/modules/user';
import InfographicStudioClient from './InfographicStudioClient';

// BUG FIX (2026-08-22): halaman ini sebelumnya adalah SATU-SATUNYA halaman admin tanpa
// guard server-side isAdminServer()/redirect() - proteksinya cuma client-side
// (useAuthUser().effectiveRole !== 'admin', lihat InfographicStudioClient.tsx). Bedanya
// dari pola yang dipakai konsisten di semua halaman admin lain (mis.
// app/admin/fundamental-backfill/page.tsx): guard client-side dirender SETELAH bundle
// JS-nya sudah terkirim ke browser, sedangkan redirect() di server component ini
// mencegah kontennya terkirim sama sekali kalau bukan admin. Pengecekan client-side di
// InfographicStudioClient.tsx sengaja DIBIARKAN sebagai lapisan kedua (mis. kalau sesi
// admin kedaluwarsa saat halaman masih terbuka), bukan diduplikasi/dihapus di sini.
export default async function InfographicStudioPage() {
  if (!(await isAdminServer())) {
    redirect('/admin-login');
  }

  return <InfographicStudioClient />;
}
