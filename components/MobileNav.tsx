'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Activity, Radar, LineChart, Menu } from 'lucide-react';

const ITEMS = [
  { label: 'Home', href: '/home', icon: Home, matches: ['/home'] },
  { label: 'Market', href: '/market-pulse', icon: Activity, matches: ['/market-pulse', '/market/'] },
  { label: 'Radar', href: '/breakout-radar', icon: Radar, matches: ['/breakout-radar', '/recommendations'] },
  { label: 'Analyze', href: '/dashboard', icon: LineChart, matches: ['/dashboard', '/fundamental', '/technical/', '/dcf', '/compare'] },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 md:hidden" aria-label="Navigasi utama mobile">
      <div className="grid grid-cols-5 items-center rounded-[22px] border border-white/10 bg-[#0A101B]/95 p-1.5 shadow-[0_18px_55px_rgba(0,0,0,0.55)] backdrop-blur-xl">
        {ITEMS.map((item) => {
          const active = item.matches.some((match) => match.endsWith('/') ? pathname.startsWith(match) : pathname === match || pathname.startsWith(`${match}/`));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-semibold transition-colors ${
                active ? 'bg-tv-blue/15 text-white' : 'text-tv-muted hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className={`h-[18px] w-[18px] ${active ? 'text-tv-blue' : ''}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event('toggle-sidebar'))}
          className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-semibold text-tv-muted transition-colors hover:bg-white/5 hover:text-white"
        >
          <Menu className="h-[18px] w-[18px]" />
          <span>Menu</span>
        </button>
      </div>
    </nav>
  );
}
