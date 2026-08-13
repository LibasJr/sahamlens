'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Activity, Radar, LineChart, Menu, Sparkles } from 'lucide-react';
import { useAuthUser } from '@/lib/hooks/useAuthUser';

const PUBLIC_ITEMS = [
  { label: 'Home', href: '/home', icon: Home, matches: ['/home'] },
  { label: 'Market', href: '/market-pulse', icon: Activity, matches: ['/market-pulse', '/market/'] },
  { label: 'Radar', href: '/breakout-radar', icon: Radar, matches: ['/breakout-radar', '/recommendations'] },
];

const GUEST_PRIMARY_ITEM = { label: 'Konsensus', href: '/technical/BBCA.JK', icon: Sparkles, matches: ['/technical/'] };
const MEMBER_PRIMARY_ITEM = { label: 'Analyze', href: '/dashboard', icon: LineChart, matches: ['/dashboard', '/fundamental', '/technical/', '/dcf', '/compare'] };

export default function MobileNav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const { effectiveRole } = useAuthUser();
  const items = [...PUBLIC_ITEMS, effectiveRole === 'guest' ? GUEST_PRIMARY_ITEM : MEMBER_PRIMARY_ITEM];

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
      <div className="grid grid-cols-5 items-stretch rounded-[22px] border border-white/10 bg-[#0A101B]/95 p-1.5 shadow-[0_18px_55px_rgba(0,0,0,0.55)] backdrop-blur-xl">
        {items.map((item) => {
          const active = item.matches.some((match) => match.endsWith('/') ? pathname.startsWith(match) : pathname === match || pathname.startsWith(`${match}/`));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-xs font-semibold leading-tight transition-colors ${
                active ? 'bg-tv-blue/15 text-white' : 'text-tv-muted hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? 'text-tv-blue' : ''}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
          className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-xs font-semibold leading-tight text-tv-muted transition-colors hover:bg-white/5 hover:text-white"
        >
          <Menu className="h-5 w-5" />
          <span>Menu</span>
        </button>
      </div>
    </nav>
  );
}
