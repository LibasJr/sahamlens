'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, User as UserIcon, Sparkles } from 'lucide-react';
import { isMarketOpen } from '@/lib/utils/market';

// BUG FIX (2026-08-05, permintaan user - revisi ke-2): percobaan pertama cuma sembunyikan
// search TopMarketBar khusus pathname === '/' (landing page root), TAPI ternyata halaman
// yang dilaporkan dobel adalah /dashboard (dan halaman Header.tsx lain: /fundamental,
// /technical/[symbol], /screener, /multi-agent, /macro, /dcf, /moat, /risk, /pattern,
// /dividend, /earnings) - route root `/` sendiri TIDAK PERNAH render TopMarketBar sama
// sekali (lihat AppShell.tsx cabang `isLandingPage`, skip total ke Dashboard.tsx yang
// punya CommandPalette+header sendiri). Daripada maintain daftar route pengecualian yang
// gampang basi tiap ada halaman baru pakai Header.tsx, search di TopMarketBar dihapus
// TOTAL (bukan kondisional) - user eksplisit minta "cuma ada di halaman utama", dan
// halaman utama memang sudah otomatis satu-satunya yang tidak lewat komponen ini.
export default function TopMarketBar() {
  const [ihsg, setIhsg] = useState<{ price: number; change: number } | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetch('/api/live/^JKSE')
      .then((r) => r.json())
      .then((data) => {
        if (
          data &&
          typeof data.price === 'number' &&
          Number.isFinite(data.price) &&
          data.price > 0 &&
          typeof data.changePercent === 'number' &&
          Number.isFinite(data.changePercent)
        ) {
          setIhsg({ price: data.price, change: data.changePercent });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((d) => { if (d.authenticated && d.user) setAuthenticated(true); })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  const marketOpen = now ? isMarketOpen(now) : false;
  const jakartaTime = now
    ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(now) + ' WIB'
    : '--:--';

  return (
    <div className="shrink-0 flex items-center gap-3 border-b border-tv-border bg-tv-surface/90 px-4 py-2.5 backdrop-blur-md">
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] font-sans font-semibold text-tv-muted uppercase tracking-wide">IHSG</span>
        {ihsg ? (
          <span className={`font-number text-[13px] font-bold ${ihsg.change >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
            {ihsg.price.toLocaleString('id-ID')} {ihsg.change >= 0 ? '+' : ''}{ihsg.change.toFixed(2)}%
          </span>
        ) : (
          <span className="text-[13px] text-tv-muted">--</span>
        )}
      </div>

      <span className={`hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium shrink-0 ${marketOpen ? 'text-tv-green' : 'text-tv-muted'}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${marketOpen ? 'bg-tv-green animate-pulse' : 'bg-tv-muted'}`} />
        {marketOpen ? 'Bursa Buka' : 'Bursa Tutup'}
      </span>

      <span className="hidden md:inline text-[11px] text-tv-muted shrink-0">Update {jakartaTime}</span>

      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event('open-ai-chat'))}
          title="Ask LensAI"
          aria-label="Ask LensAI"
          className="hidden sm:flex items-center gap-1.5 rounded-full bg-tv-blue/10 hover:bg-tv-blue/20 text-tv-blue px-3 py-1.5 text-[11px] font-semibold transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5" /> Ask LensAI
        </button>
        <Link
          href="/watchlist"
          title="Notifikasi & Alert"
          aria-label="Notifikasi & Alert"
          className="p-2 rounded-md text-tv-muted hover:text-tv-text hover:bg-tv-hover transition-colors"
        >
          <Bell className="h-4 w-4" />
        </Link>
        {!authChecked ? (
          <span className="p-2 text-tv-muted opacity-50" aria-hidden="true">
            <UserIcon className="h-4 w-4" />
          </span>
        ) : authenticated ? (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('open-profile-modal'))}
            title="Profil"
            aria-label="Profil"
            className="p-2 rounded-md text-tv-muted hover:text-tv-text hover:bg-tv-hover transition-colors"
          >
            <UserIcon className="h-4 w-4" />
          </button>
        ) : (
          <Link
            href="/login"
            title="Masuk"
            aria-label="Masuk"
            className="p-2 rounded-md text-tv-muted hover:text-tv-text hover:bg-tv-hover transition-colors"
          >
            <UserIcon className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
