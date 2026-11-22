'use client';

import { Button } from '@/components/ui/Button';
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Activity, Radar, LineChart, Menu, Sparkles, Search, X } from 'lucide-react';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import { useLanguage } from '@/lib/i18n';

const NAV_DEFS = {
  home: { href: '/', icon: Home, matches: ['/'] },
  market: { href: '/market-pulse', icon: Activity, matches: ['/market-pulse', '/market/'] },
  radar: { href: '/breakout-radar', icon: Radar, matches: ['/breakout-radar', '/recommendations'] },
  guestAnalysis: { href: '/technical/BBCA.JK', icon: Sparkles, matches: ['/technical/'] },
  memberAnalysis: { href: '/dashboard', icon: LineChart, matches: ['/dashboard', '/fundamental', '/technical/', '/dcf', '/compare'] },
} as const;

export default function MobileNav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const { effectiveRole, loading, resolved } = useAuthUser();
  const { t } = useLanguage();
  const [isHubOpen, setIsHubOpen] = useState(false);

  // Saat status sesi belum pasti, tampilkan pintu analisis anggota agar user yang
  // sudah login tidak melihat item tamu lalu berkedip berubah sesaat kemudian.
  const isConfirmedGuest = !loading && resolved && effectiveRole === 'guest';

  const items = [
    { ...NAV_DEFS.home, label: t('nav.home') },
    { ...NAV_DEFS.market, label: 'Market' },
    { ...NAV_DEFS.radar, label: 'Radar' },
    isConfirmedGuest
      ? { ...NAV_DEFS.guestAnalysis, label: t('nav.groupAnalysis') }
      : { ...NAV_DEFS.memberAnalysis, label: t('nav.groupAnalysis') },
  ];

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    let frame = 0;

    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = nav.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        // Clearance is measured from the top edge of the real fixed nav to the
        // bottom of the current mobile viewport. This automatically includes
        // the nav's actual height, bottom gap, and safe-area inset.
        const clearance = Math.max(0, Math.ceil(viewportHeight - rect.top));
        document.documentElement.style.setProperty('--lens-mobile-nav-clearance', `${clearance}px`);
      });
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    window.addEventListener('resize', measure, { passive: true });
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
      document.documentElement.style.removeProperty('--lens-mobile-nav-clearance');
    };
  }, []);

  return (
    <nav ref={navRef} className="lens-mobile-nav fixed inset-x-3 z-40 font-sans md:hidden" aria-label="Navigasi utama mobile">
      {/* Quick Action Popup Hub */}
      {isHubOpen && (
        <div className="mb-2 overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0A101B]/95 p-2 shadow-[0_16px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-2 pb-2 pt-1">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-tv-blue" />
              Aksi Cepat
            </span>
            <Button variant="bare" size="none"
              type="button"
              onClick={() => setIsHubOpen(false)}
              aria-label="Tutup aksi cepat"
              className="text-tv-muted hover:text-white transition-colors p-1 rounded-md"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 pt-2">
            <Button variant="bare" size="none"
              type="button"
              onClick={() => {
                setIsHubOpen(false);
                window.dispatchEvent(new CustomEvent('open-global-search'));
              }}
              className="flex items-center gap-2.5 rounded-xl border border-white/[0.05] bg-white/[0.03] p-2.5 text-left text-xs font-semibold text-white transition-colors hover:bg-white/[0.08] hover:border-tv-blue/30 active:scale-[0.98]"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-tv-blue/15 text-tv-blue">
                <Search className="h-4 w-4" />
              </div>
              <div>
                <p className="font-bold text-[12px] leading-tight">Cari Emiten</p>
                <p className="text-[10px] text-tv-muted">Ticker & rasio</p>
              </div>
            </Button>
            <Button variant="bare" size="none"
              type="button"
              onClick={() => {
                setIsHubOpen(false);
                window.dispatchEvent(new CustomEvent('open-ai-chat'));
              }}
              className="flex items-center gap-2.5 rounded-xl border border-white/[0.05] bg-white/[0.03] p-2.5 text-left text-xs font-semibold text-white transition-colors hover:bg-white/[0.08] hover:border-tv-blue/30 active:scale-[0.98]"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-purple-400">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="font-bold text-[12px] leading-tight">Tanya LensAI</p>
                <p className="text-[10px] text-tv-muted">Analisis instan</p>
              </div>
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-5 items-stretch rounded-[18px] border border-white/[0.08] bg-[#0A101B]/92 p-1 shadow-[0_10px_32px_rgba(0,0,0,0.38)] backdrop-blur-xl">
        {items.map((item) => {
          const active = item.matches.some((match) => {
            if (match === '/') return pathname === '/';
            return match.endsWith('/') ? pathname.startsWith(match) : pathname === match || pathname.startsWith(`${match}/`);
          });
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-xs font-semibold leading-tight transition-colors ${
                active ? 'bg-tv-blue/[0.08] text-white' : 'text-tv-muted hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <Icon className={`h-[19px] w-[19px] shrink-0 ${active ? 'text-tv-blue' : ''}`} />
              {/* truncate + w-full: pagar terakhir. Kalau suatu saat ada label yang lebih
                  panjang dari selnya, ia dipotong di dalam selnya sendiri - tidak meluber
                  menimpa label tetangga seperti sebelumnya. */}
              <span className={`w-full truncate text-center text-[11px] ${active ? '' : 'opacity-90'}`}>{item.label}</span>
            </Link>
          );
        })}
        <Button variant="bare" size="none"
          type="button"
          onClick={() => {
            setIsHubOpen((prev) => !prev);
            window.dispatchEvent(new Event('toggle-sidebar'));
          }}
          aria-label="Buka menu navigasi lengkap"
          className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-xs font-semibold leading-tight transition-colors ${
            isHubOpen ? 'bg-tv-blue/20 text-tv-blue' : 'text-tv-muted hover:bg-white/[0.04] hover:text-white'
          }`}
        >
          <div className="relative flex items-center justify-center">
            <Menu className="h-[19px] w-[19px] shrink-0" />
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-tv-blue" />
          </div>
          <span className="w-full truncate text-center text-[11px] opacity-90">Menu</span>
        </Button>
      </div>
    </nav>
  );
}
