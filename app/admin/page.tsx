import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, BarChart3, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { isAdminServer } from '@/modules/user';
import { getActiveUsers } from '@/shared/auth/presence';
import { EmptyState } from '@/components/ui';
import ExportButton from './ExportButton';
import SetProForm from './SetProForm';
import ChangeSecretForm from './ChangeSecretForm';

// Root layout menyetel robots index:true untuk seluruh situs. Halaman admin ikut
// mewarisinya - meski pengunjung non-admin dialihkan, tidak ada alasan rute ini
// mengundang perayapan sama sekali.
export const metadata = {
  robots: { index: false, follow: false },
};

/** Jam WIB eksplisit. Halaman ini Server Component, jadi toLocaleTimeString tanpa
 *  timeZone memakai zona waktu SERVER - di Vercel itu UTC, sehingga jam yang
 *  ditampilkan meleset 7 jam dari WIB sambil tetap berformat Indonesia. */
function jamWib(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'waktu tidak terbaca';
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' }) + ' WIB';
}

export default async function AdminPage() {
  if (!(await isAdminServer())) {
    redirect('/admin-login');
  }

  // "Aktif sekarang" - presence Redis (lihat shared/auth/presence.ts), TTL 5 menit -
  // BUKAN query database, langsung dari sesi yang benar-benar melakukan request.
  const activeUsers = await getActiveUsers();
  const snapshotAt = new Date().toISOString();

  // Rekap peran: 12 baris tabel tidak langsung memberi tahu komposisinya, dan itu
  // yang biasanya dicari admin saat membuka halaman ini.
  const byRole = activeUsers.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] ?? 0) + 1;
    return acc;
  }, {});
  const rekapPeran = Object.entries(byRole)
    .sort((a, b) => b[1] - a[1])
    .map(([role, n]) => `${n} ${role}`)
    .join(', ');

  return (
    <div className="min-h-screen bg-tv-bg text-tv-text p-4 sm:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 text-sm text-tv-muted hover:text-tv-text transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Beranda
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-tv-text">SahamLens Admin Panel</h1>
          <ExportButton />
        </div>
        <SetProForm />
        <ChangeSecretForm />

        {/* Dua pintu masuk ini sebelumnya bertumpuk selebar penuh dengan mb-8
            masing-masing, mendorong tabel "Aktif Sekarang" jauh ke bawah lipatan. */}
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Link
          href="/admin/calibration"
          className="flex items-start gap-3 rounded-xl border border-tv-border bg-tv-card p-5 hover:border-tv-borderLight hover:bg-tv-hover transition-colors"
        >
          <div className="rounded-lg bg-tv-accent/10 p-2 text-tv-accent">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-tv-text">LensRadar Calibration Lab</h2>
            <p className="text-sm text-tv-muted mt-1">
              Audit bucket LensScore, t-test edge T+20, simulasi threshold, dan rekomendasi ambang AI.
            </p>
          </div>
        </Link>

        <Link
          href="/admin/fundamental-backfill"
          className="flex items-start gap-3 rounded-xl border border-tv-border bg-tv-card p-5 hover:border-tv-borderLight hover:bg-tv-hover transition-colors"
        >
          <div className="rounded-lg bg-tv-blue/10 p-2 text-tv-blue">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-tv-text">Fundamental Backfill</h2>
            <p className="text-sm text-tv-muted mt-1">
              Upload/paste CSV fundamental point-in-time, Dry Run, lalu insert append-only ke histori.
            </p>
          </div>
        </Link>
        </div>

        <div className="bg-tv-card border border-tv-border rounded-lg overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-tv-border flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tv-green opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-tv-green"></span>
              </span>
              <h2 className="font-heading text-lg font-bold text-tv-text">Aktif Sekarang</h2>
              <span className="text-xs text-tv-muted">
                ({activeUsers.length} user, aktivitas 5 menit terakhir{rekapPeran ? ` — ${rekapPeran}` : ''})
              </span>
            </div>
            {/* Titik hijau berdenyut menyiratkan data ini hidup, padahal ia snapshot
                saat halaman dirender dan tidak pernah menyegarkan dirinya. Waktu
                snapshot dinyatakan, dan disediakan cara memuat ulang.
                <a> biasa, bukan <Link>: navigasi klien ke rute yang sama tidak
                memicu pengambilan ulang di server. */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-tv-muted">Snapshot {jamWib(snapshotAt)}</span>
              <a
                href="/admin"
                className="inline-flex items-center gap-1.5 rounded-md border border-tv-border bg-tv-bg px-2.5 py-1.5 text-xs font-semibold text-tv-muted transition-colors hover:text-tv-text"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Segarkan
              </a>
            </div>
          </div>
          {activeUsers.length === 0 ? (
            <EmptyState
              illustration="search"
              title="Tidak ada user aktif saat ini"
              description="Presence disimpan di Redis dengan TTL 5 menit. Daftar kosong juga muncul kalau Redis belum dikonfigurasi atau sedang tidak bisa dihubungi - itu degradasi yang disengaja, bukan error."
            />
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-tv-bg text-tv-muted">
                <tr>
                  <th className="px-6 py-3 whitespace-nowrap">Email</th>
                  <th className="px-6 py-3 whitespace-nowrap">Role</th>
                  <th className="px-6 py-3 whitespace-nowrap">Terakhir Aktif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tv-border">
                {activeUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-tv-hover">
                    <td className="px-6 py-3 text-tv-text whitespace-nowrap">{u.email}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        u.role === 'admin' ? 'bg-tv-red/20 text-tv-red' :
                        u.role === 'pro' ? 'bg-tv-green/20 text-tv-green' :
                        'bg-tv-hover text-tv-muted'
                      }`}>
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-tv-muted font-number whitespace-nowrap">{jamWib(u.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
