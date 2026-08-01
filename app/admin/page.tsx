import { supabaseAdmin } from '@/lib/supabase';
import React from 'react';
import { redirect } from 'next/navigation';
import { isAdminServer } from '@/modules/user';
import { getActiveUsers } from '@/shared/auth/presence';
import ExportButton from './ExportButton';

export default async function AdminPage() {
  if (!isAdminServer()) {
    redirect('/admin-login');
  }

  const { data: users, error: usersError } = await supabaseAdmin
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  const today = new Date().toISOString().split('T')[0];
  const { count: todayAnalisa } = await supabaseAdmin
    .from('usage_logs')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', `${today}T00:00:00Z`);

  const { data: usageLogs } = await supabaseAdmin
    .from('usage_logs')
    .select('symbol');

  const topTickers: Record<string, number> = {};
  if (usageLogs) {
    usageLogs.forEach((log: any) => {
      if (log.symbol) {
        topTickers[log.symbol] = (topTickers[log.symbol] || 0) + 1;
      }
    });
  }

  const sortedTickers = Object.entries(topTickers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // "Aktif sekarang" - presence Redis (lihat shared/auth/presence.ts), TTL 5 menit -
  // BUKAN query database, langsung dari sesi yang benar-benar melakukan request.
  const activeUsers = await getActiveUsers();

  return (
    <div className="min-h-screen bg-tv-bg text-tv-text p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="font-heading text-3xl font-bold text-tv-text">SahamLens Admin Panel</h1>
          <ExportButton />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-tv-card border border-tv-border p-6 rounded-lg">
            <h3 className="text-tv-muted text-sm mb-2">Total Users</h3>
            <p className="text-3xl font-bold text-tv-text font-number">{users?.length || 0}</p>
          </div>
          <div className="bg-tv-card border border-tv-border p-6 rounded-lg">
            <h3 className="text-tv-muted text-sm mb-2">Analisa Hari Ini</h3>
            <p className="text-3xl font-bold text-tv-green font-number">{todayAnalisa || 0}</p>
          </div>
          <div className="bg-tv-card border border-tv-border p-6 rounded-lg">
            <h3 className="text-tv-muted text-sm mb-2">Top Ticker</h3>
            <p className="text-xl font-bold text-tv-yellow font-number">{sortedTickers[0]?.[0] || '-'} <span className="text-sm text-tv-muted">({sortedTickers[0]?.[1] || 0}x)</span></p>
          </div>
        </div>

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
            <table className="w-full text-left text-sm">
              <thead className="bg-tv-bg text-tv-muted">
                <tr>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">Terakhir Aktif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tv-border">
                {activeUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-tv-hover">
                    <td className="px-6 py-3 text-tv-text">{u.email}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        u.role === 'admin' ? 'bg-tv-red/20 text-tv-red' :
                        u.role === 'pro' ? 'bg-tv-green/20 text-tv-green' :
                        'bg-tv-hover text-tv-muted'
                      }`}>
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-tv-muted font-number">{new Date(u.lastSeen).toLocaleTimeString('id-ID')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-tv-card border border-tv-border rounded-lg overflow-hidden mb-8">
          <table className="w-full text-left text-sm">
            <thead className="bg-tv-bg text-tv-muted">
              <tr>
                <th className="px-6 py-4">Telegram ID</th>
                <th className="px-6 py-4">Username</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Sisa Analisa</th>
                <th className="px-6 py-4">Joined</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tv-border">
              {users?.map((user: any) => (
                <tr key={user.id} className="hover:bg-tv-hover">
                  <td className="px-6 py-4 font-number text-tv-text">{user.telegram_id}</td>
                  <td className="px-6 py-4 text-tv-text">{user.username || user.first_name || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      user.role === 'admin' ? 'bg-tv-red/20 text-tv-red' :
                      user.role === 'pro' ? 'bg-tv-green/20 text-tv-green' :
                      'bg-tv-hover text-tv-muted'
                    }`}>
                      {user.role.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-number text-tv-text">{user.sisa_analisa}</td>
                  <td className="px-6 py-4 text-tv-muted">{new Date(user.created_at).toLocaleDateString('id-ID')}</td>
                  <td className="px-6 py-4">
                    {user.role === 'free' && (
                      <form action={async () => {
                        'use server';
                        if (!isAdminServer()) return;
                        await supabaseAdmin.from('users').update({ role: 'pro', sisa_analisa: 999 }).eq('id', user.id);
                        await supabaseAdmin.from('payments').insert({
                          telegram_id: user.telegram_id,
                          paket: 'Pro 149k',
                          status: 'lunas',
                          expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                        });
                      }}>
                        <button type="submit" className="text-xs bg-gradient-accent text-white px-3 py-1.5 rounded font-bold hover:brightness-110 transition-all">
                          Set Pro
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
