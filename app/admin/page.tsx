import React from 'react';
import { redirect } from 'next/navigation';
import { isAdminServer } from '@/modules/user';
import { getActiveUsers } from '@/shared/auth/presence';
import ExportButton from './ExportButton';

export default async function AdminPage() {
  if (!isAdminServer()) {
    redirect('/admin-login');
  }

  // "Aktif sekarang" - presence Redis (lihat shared/auth/presence.ts), TTL 5 menit -
  // BUKAN query database, langsung dari sesi yang benar-benar melakukan request.
  const activeUsers = await getActiveUsers();

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-tv-text p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-white">SahamLens Admin Panel</h1>
          <ExportButton />
        </div>

        <div className="bg-tv-card border border-tv-border rounded-xl overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-tv-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#14b8a6] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#14b8a6]"></span>
              </span>
              <h2 className="text-lg font-bold text-white">Aktif Sekarang</h2>
              <span className="text-xs text-gray-500 font-mono">({activeUsers.length} user, aktivitas 5 menit terakhir)</span>
            </div>
          </div>
          {activeUsers.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500 text-sm font-mono">
              Tidak ada user yang aktif saat ini.
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-[#131c2e] text-gray-400 font-mono">
                <tr>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">Terakhir Aktif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tv-border">
                {activeUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-white/5">
                    <td className="px-6 py-3 text-white">{u.email}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        u.role === 'admin' ? 'bg-red-500/20 text-red-500' :
                        u.role === 'pro' ? 'bg-[#14b8a6]/20 text-[#14b8a6]' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-400 font-mono">{new Date(u.lastSeen).toLocaleTimeString('id-ID')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
