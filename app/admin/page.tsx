import { supabaseAdmin } from '@/lib/supabase';
import React from 'react';
import * as xlsx from 'xlsx';
import ExportButton from './ExportButton';

export default async function AdminPage() {
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

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-tv-text p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-white">SahamLens Admin Panel</h1>
          <ExportButton />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-tv-card border border-tv-border p-6 rounded-xl">
            <h3 className="text-gray-400 font-mono text-sm mb-2">Total Users</h3>
            <p className="text-3xl font-bold text-white">{users?.length || 0}</p>
          </div>
          <div className="bg-tv-card border border-tv-border p-6 rounded-xl">
            <h3 className="text-gray-400 font-mono text-sm mb-2">Analisa Hari Ini</h3>
            <p className="text-3xl font-bold text-[#14b8a6]">{todayAnalisa || 0}</p>
          </div>
          <div className="bg-tv-card border border-tv-border p-6 rounded-xl">
            <h3 className="text-gray-400 font-mono text-sm mb-2">Top Ticker</h3>
            <p className="text-xl font-bold text-tv-yellow">{sortedTickers[0]?.[0] || '-'} <span className="text-sm text-gray-500">({sortedTickers[0]?.[1] || 0}x)</span></p>
          </div>
        </div>

        <div className="bg-tv-card border border-tv-border rounded-xl overflow-hidden mb-8">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#131c2e] text-gray-400 font-mono">
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
                <tr key={user.id} className="hover:bg-white/5">
                  <td className="px-6 py-4 font-mono text-white">{user.telegram_id}</td>
                  <td className="px-6 py-4 text-gray-300">{user.username || user.first_name || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      user.role === 'admin' ? 'bg-red-500/20 text-red-500' :
                      user.role === 'pro' ? 'bg-[#14b8a6]/20 text-[#14b8a6]' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {user.role.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-gray-300">{user.sisa_analisa}</td>
                  <td className="px-6 py-4 text-gray-400">{new Date(user.created_at).toLocaleDateString('id-ID')}</td>
                  <td className="px-6 py-4">
                    {user.role === 'free' && (
                      <form action={async () => {
                        'use server';
                        await supabaseAdmin.from('users').update({ role: 'pro', sisa_analisa: 999 }).eq('id', user.id);
                        await supabaseAdmin.from('payments').insert({
                          telegram_id: user.telegram_id,
                          paket: 'Pro 149k',
                          status: 'lunas',
                          expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                        });
                      }}>
                        <button type="submit" className="text-xs bg-[#14b8a6] text-white px-3 py-1.5 rounded font-bold hover:bg-[#0d9488]">
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
