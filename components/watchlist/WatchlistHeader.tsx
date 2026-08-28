'use client';

import React from 'react';
import { Activity, Bell, BellRing, RefreshCw, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { AnimatedNumber, Button } from '@/components/ui';
import { PushNotificationControl } from './PushNotificationControl';

interface WatchlistHeaderProps {
  loading: boolean;
  totalCurrent: number;
  totalInvested: number;
  totalPnlPct: number;
  watchlistCount: number;
  watchlistLimit: number | '∞';
  activeAlertsCount: number;
  onRefresh: () => void;
}

/** Summary/read-side only. Add/remove watchlist dan alert tetap dimiliki page. */
export function WatchlistHeader({
  loading,
  totalCurrent,
  totalInvested,
  totalPnlPct,
  watchlistCount,
  watchlistLimit,
  activeAlertsCount,
  onRefresh,
}: WatchlistHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.055] bg-tv-bg/80 px-4 py-5 backdrop-blur-xl md:px-6">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-tv-blue text-white">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h2 className="lens-page-title">LensWatch</h2>
            <p className="text-xs text-white/50">Pantau portofolio dan set notifikasi hp (Push Notification)</p>
          </div>
        </div>
        <div className="flex items-start gap-2 flex-wrap justify-end">
          <PushNotificationControl />
          <Button
            variant="bare"
            size="none"
            onClick={onRefresh}
            disabled={loading}
            className="bg-white/5 border border-white/10 hover:bg-white/10 px-4 py-2 rounded-full text-white flex items-center gap-2 transition-colors disabled:opacity-50 text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg bg-white/5 border border-white/10 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40"><Wallet className="w-3 h-3" /> Nilai Posisi</div>
          <div className="mt-1 text-[16px] font-bold text-white font-number">
            {totalCurrent > 0
              ? <AnimatedNumber value={totalCurrent} format={(value) => `Rp ${Math.round(value).toLocaleString('id-ID')}`} />
              : <span className="text-[11px] font-normal text-white/40">isi harga beli &amp; lot dulu</span>}
          </div>
        </div>
        <div className="rounded-lg bg-white/5 border border-white/10 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40">
            {totalInvested <= 0 ? <Activity className="w-3 h-3" /> : totalPnlPct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />} Total P&amp;L
          </div>
          <div className={`mt-1 text-[16px] font-bold font-number ${totalInvested <= 0 ? 'text-white/40' : totalPnlPct >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
            {totalInvested > 0
              ? `${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%`
              : <span className="text-[11px] font-normal">belum ada posisi</span>}
          </div>
        </div>
        <div className="rounded-lg bg-white/5 border border-white/10 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40"><Activity className="w-3 h-3" /> Saham Dipantau</div>
          <div className="mt-1 text-[16px] font-bold text-white font-number">{watchlistCount} / {watchlistLimit}</div>
        </div>
        <div className="rounded-lg bg-white/5 border border-white/10 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40"><BellRing className="w-3 h-3" /> Alert Aktif</div>
          <div className="mt-1 text-[16px] font-bold text-white font-number">{activeAlertsCount}</div>
        </div>
      </div>
    </header>
  );
}
