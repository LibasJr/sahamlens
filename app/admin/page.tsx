import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { isAdminServer } from '@/modules/user';
import { getActiveUsers } from '@/shared/auth/presence';
import ExportButton from './ExportButton';
import SetProForm from './SetProForm';
import ChangeSecretForm from './ChangeSecretForm';

export default async function AdminPage() {
  if (!isAdminServer()) {
    redirect('/admin-login');
  }

  // "Aktif sekarang" - presence Redis (lihat shared/auth/presence.ts), TTL 5 menit -
  // BUKAN query database, langsung dari sesi yang benar-benar melakukan request.
  const activeUsers = await getActiveUsers();

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

        <div className="bg-tv-card border border-tv-border rounded-lg overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-tv-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tv-green opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-tv-green"></span>
              </span>
              <h2 className="font-heading text-lg font-bold text-tv-text">Aktif Sekarang</h2>
              <span className="text-xs text-tv-muted">({activeUsers.length} user, aktivitas 5 menit terakhir)</span>
            </div>
          </div>
          {activeUsers.length === 0 ? (
            <div className="px-6 py-8 text-center text-tv-muted text-sm">
              Tidak ada user yang aktif saat ini.
            </div>
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
                    <td className="px-6 py-3 text-tv-muted font-number whitespace-nowrap">{new Date(u.lastSeen).toLocaleTimeString('id-ID')}</td>
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
