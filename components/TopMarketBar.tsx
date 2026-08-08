'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Clock3, Menu, User as UserIcon } from 'lucide-react';
import { isMarketOpen } from '@/lib/utils/market';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import TrialCountdown from './TrialCountdown';
import CommandPalette from './CommandPalette';

const MODULE_SEARCH_ROUTES = ['/dashboard', '/fundamental', '/macro', '/screener', '/multi-agent'];

export default function TopMarketBar() {
  const pathname = usePathname();
  const [ihsg, setIhsg] = useState<{ price: number; change: number } | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const { loading: authLoading, user, effectiveRole, trialDaysLeft } = useAuthUser();

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetch('/api/live/^JKSE')
      .then((response) => response.json())
      .then((data) => {
        if (
          data &&
          typeof data.price === 'number' && Number.isFinite(data.price) && data.price > 0 &&
          typeof data.changePercent === 'number' && Number.isFinite(data.changePercent)
        ) {
          setIhsg({ price: data.price, change: data.changePercent });
        }
      })
      .catch(() => {});
  }, []);

  const marketOpen = now ? isMarketOpen(now) : false;
  const hasModuleSearch = MODULE_SEARCH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`)) || pathname.startsWith('/technical/');
  const jakartaTime = now
    ? `${new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)} WIB`
    : '--:--';

  return (
    <header className="relative z-30 flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.07] bg-[#080D16]/88 px-3 backdrop-blur-xl md:px-5">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
        aria-label="Buka menu"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-tv-muted transition-colors hover:bg-white/[0.05] hover:text-white md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.025] px-2.5 py-1.5 md:px-3">
        <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-tv-muted">IHSG</span>
        {ihsg ? (
          <>
            <span className="hidden font-number text-xs font-bold text-white sm:inline">{ihsg.price.toLocaleString('id-ID')}</span>
            <span className={`font-number text-[11px] font-bold ${ihsg.change >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
              {ihsg.change >= 0 ? '+' : ''}{ihsg.change.toFixed(2)}%
            </span>
          </>
        ) : (
          <span className="font-number text-xs text-tv-muted">--</span>
        )}
      </div>

      {!hasModuleSearch && (
        <div className="hidden min-w-0 max-w-[520px] flex-1 lg:block">
          <CommandPalette />
        </div>
      )}
      {hasModuleSearch && <div className="hidden flex-1 lg:block" />}

      <div className="ml-auto flex items-center gap-1.5">
        <div className={`hidden items-center gap-2 rounded-xl border px-2.5 py-1.5 text-[10px] font-semibold md:flex ${marketOpen ? 'border-tv-green/15 bg-tv-green/[0.08] text-tv-green' : 'border-white/[0.06] bg-white/[0.025] text-tv-muted'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${marketOpen ? 'bg-tv-green shadow-[0_0_8px_rgba(35,196,131,0.8)]' : 'bg-tv-muted/50'}`} />
          {marketOpen ? 'Bursa buka' : 'Bursa tutup'}
        </div>

        <div className="hidden items-center gap-1.5 px-2 text-[10px] font-medium text-tv-muted xl:flex">
          <Clock3 className="h-3.5 w-3.5" /> {jakartaTime}
        </div>

        <TrialCountdown daysLeft={trialDaysLeft} />

        {effectiveRole !== 'guest' && (
          <Link
            href="/watchlist"
            title="Watchlist & alert"
            aria-label="Watchlist & alert"
            className="relative flex h-9 w-9 items-center justify-center rounded-xl text-tv-muted transition-colors hover:bg-white/[0.05] hover:text-white"
          >
            <Bell className="h-4 w-4" />
          </Link>
        )}

        {authLoading ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-xl text-tv-muted/40"><UserIcon className="h-4 w-4" /></span>
        ) : user ? (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('open-profile-modal'))}
            title="Profil"
            aria-label="Profil"
            className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.025] px-2 text-tv-muted transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-tv-blue/20 to-tv-purple/20 text-tv-blue">
              <UserIcon className="h-3.5 w-3.5" />
            </span>
            <span className="hidden max-w-[90px] truncate text-[10px] font-semibold text-white/80 2xl:block">{user.email?.split('@')[0]}</span>
          </button>
        ) : (
          <Link href="/login" className="rounded-xl bg-tv-blue px-3 py-2 text-[11px] font-bold text-white shadow-[0_8px_24px_rgba(79,140,255,0.18)] transition hover:bg-tv-blueHover">
            Masuk
          </Link>
        )}
      </div>
    </header>
  );
}
