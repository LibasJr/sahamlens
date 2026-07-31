'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Activity,
  LineChart,
  Building2,
  GitCompare,
  History,
  Sparkles,
  Radar,
  Bell,
  Wallet,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

// Redesign Sidebar - Design System "Nucleus" (2026-07-31).
// Semua 11 tujuan navigasi yang ada sebelumnya DIPERTAHANKAN UTUH - yang
// berubah cuma bagaimana mereka dikelompokkan & ditampilkan. Struktur lama
// (flat list 11 item, badge di hampir semua item, ikon Target/Activity
// dipakai berulang untuk 3-4 tujuan berbeda) diganti grouping per fungsi,
// satu ikon unik per tujuan, dan badge dibatasi HANYA untuk data yang
// genuinely real-time (LIVE) - bukan label dekoratif yang mengulang nama item.
interface NavItem {
  id: string;
  name: string;
  subtitle: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  live?: boolean;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'beranda',
    label: 'Beranda',
    items: [
      { id: 'home', name: 'Beranda', subtitle: 'AI Insight & Ringkasan Akun', path: '/home', icon: LayoutDashboard },
      { id: 'market-pulse', name: 'Market Pulse', subtitle: 'Index, Sector & Breadth', path: '/market-pulse', icon: Activity, live: true },
    ],
  },
  {
    id: 'analisis',
    label: 'Analisis',
    items: [
      { id: 'dashboard', name: 'Technical Analyzer', subtitle: '10 Pure Math Filters', path: '/dashboard', icon: LineChart },
      { id: 'fundamental', name: 'Fundamental Analyzer', subtitle: 'Value & Health Metrics', path: '/fundamental', icon: Building2 },
      { id: 'compare', name: 'Compare Tool', subtitle: 'Side-by-Side Analysis', path: '/compare', icon: GitCompare },
      { id: 'backtest', name: 'Strategy Builder', subtitle: 'Simulasi Performa Historis', path: '/backtest', icon: History },
    ],
  },
  {
    id: 'sinyal',
    label: 'Sinyal AI',
    items: [
      { id: 'recommendations', name: 'Stock Recommendations', subtitle: 'Daily AI Consensus', path: '/recommendations', icon: Sparkles },
      { id: 'breakout-radar', name: 'Breakout Radar', subtitle: 'Top LQ45 Momentum', path: '/breakout-radar', icon: Radar, live: true },
    ],
  },
  {
    id: 'portofolio',
    label: 'Portofolio Saya',
    items: [
      { id: 'watchlist', name: 'Watchlist & Alerts', subtitle: 'Portfolio & Telegram Bot', path: '/watchlist', icon: Bell },
      { id: 'portfolio', name: 'Akun Demo', subtitle: 'Paper Trading & P/L', path: '/portfolio', icon: Wallet },
      { id: 'calendar', name: 'Corporate Calendar', subtitle: 'Dividen, RUPS, & Corp Action', path: '/calendar', icon: CalendarDays },
    ],
  },
];

const COLLAPSE_STORAGE_KEY = 'sahamlens_sidebar_collapsed';

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const handleToggle = () => setIsOpen((prev) => !prev);
    const handleClose = () => setIsOpen(false);

    window.addEventListener('toggle-sidebar', handleToggle);
    window.addEventListener('close-sidebar', handleClose);
    return () => {
      window.removeEventListener('toggle-sidebar', handleToggle);
      window.removeEventListener('close-sidebar', handleClose);
    };
  }, []);

  // Baca preferensi collapse dari localStorage setelah mount (bukan di
  // useState langsung) - supaya render pertama di server & client sama
  // persis (hindari hydration mismatch), preferensi baru diterapkan sesaat
  // setelah mount.
  useEffect(() => {
    const stored = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (stored === 'true') setIsCollapsed(true);
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 bg-[#0F141D] border-r border-white/5 flex flex-col h-screen select-none transform transition-all duration-300 ease-in-out md:relative md:translate-x-0 ${
          isOpen ? 'translate-x-0 shadow-2xl shadow-black/50' : '-translate-x-full'
        } ${isCollapsed ? 'md:w-20 w-72' : 'w-72'}`}
      >
        {/* Brand Header */}
        <div className={`border-b border-white/5 flex items-center bg-gradient-to-b from-white/[0.02] to-transparent ${isCollapsed ? 'md:justify-center md:px-2' : 'justify-between px-5'} py-5`}>
          <Link href="/" className="flex items-center gap-3 min-w-0">
            <div className="flex items-center -space-x-1 shrink-0">
              <div className="bg-tv-green/20 p-1.5 rounded-l-lg border border-tv-green/30">
                <TrendingUp className="w-4 h-4 text-tv-green" />
              </div>
              <div className="bg-tv-red/20 p-1.5 rounded-r-lg border border-tv-red/30">
                <TrendingDown className="w-4 h-4 text-tv-red" />
              </div>
            </div>
            <div className={isCollapsed ? 'md:hidden' : ''}>
              <h1 className="text-base font-bold text-white leading-none">SahamLens</h1>
              <p className="text-[10px] font-medium text-white/40 uppercase tracking-widest mt-1">IDX Analytics</p>
            </div>
          </Link>

          {/* Toggle collapse - desktop only, mobile pakai overlay drawer biasa */}
          <button
            onClick={toggleCollapse}
            className={`hidden md:flex items-center justify-center w-7 h-7 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors ${isCollapsed ? 'md:mt-2' : ''}`}
            title={isCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          >
            {isCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav Groups */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.id}>
              {/* Section label - hilang saat collapsed, diganti divider tipis */}
              {!isCollapsed && (
                <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase text-white/30 tracking-wider">
                  {group.label}
                </div>
              )}
              {isCollapsed && <div className="hidden md:block mx-2 mb-2 border-t border-white/5" />}

              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.path;
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.id}
                      href={item.path}
                      className={`group relative flex items-center gap-3 rounded-lg text-xs transition-all duration-150 ease-out ${
                        isCollapsed ? 'md:justify-center md:px-0 md:py-2.5 px-3 py-2.5' : 'px-2.5 py-2.5'
                      } ${
                        isActive
                          ? 'bg-white/[0.07] text-white'
                          : 'text-white/60 hover:bg-white/[0.04] hover:text-white'
                      }`}
                    >
                      {/* Active indicator - satu sinyal jelas, bukan border+bg+badge sekaligus.
                          layoutId membuat indikator ini "meluncur" antar item saat navigasi,
                          bukan muncul/hilang tiba-tiba - shared layout animation ala Linear/Raycast. */}
                      {isActive && (
                        <motion.span
                          layoutId="sidebar-active-indicator"
                          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-tv-blue"
                          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
                        />
                      )}

                      <div
                        className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-md transition-all duration-150 ${
                          isActive ? 'bg-tv-blue/15 text-tv-blue' : 'text-white/40 group-hover:text-white group-hover:scale-110'
                        }`}
                      >
                        <Icon className="w-[18px] h-[18px]" />
                      </div>

                      <div className={`flex-1 min-w-0 ${isCollapsed ? 'md:hidden' : ''}`}>
                        <div className="flex items-center gap-1.5">
                          <span className={`font-medium truncate text-[13px] ${isActive ? 'text-white' : ''}`}>{item.name}</span>
                          {item.live && (
                            <span className="shrink-0 flex items-center gap-1 text-[8px] font-bold uppercase tracking-wide text-tv-green">
                              <span className="w-1 h-1 rounded-full bg-tv-green animate-pulse" />
                              Live
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-white/35 truncate mt-0.5">{item.subtitle}</div>
                      </div>

                      {/* Tooltip custom saat collapsed - lebih rapi dari native title, muncul di sebelah kanan icon */}
                      {isCollapsed && (
                        <span className="hidden md:group-hover:flex absolute left-full ml-2 items-center whitespace-nowrap px-2.5 py-1.5 rounded-md bg-[#1A2130] border border-white/10 text-white text-xs font-medium shadow-1 z-50 pointer-events-none">
                          {item.name}
                          {item.live && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-tv-green" />}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer - status feed */}
        <div className={`p-3 border-t border-white/5 ${isCollapsed ? 'md:flex md:justify-center' : ''}`}>
          <div className={`flex items-center gap-1.5 text-[10px] text-white/35 ${isCollapsed ? 'md:hidden' : ''}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-tv-green animate-pulse shrink-0" />
            <span className="truncate">IDX Live Feed &middot; yfinance</span>
          </div>
          <span className={`hidden ${isCollapsed ? 'md:block' : ''} w-1.5 h-1.5 rounded-full bg-tv-green animate-pulse`} />
          {!isCollapsed && (
            <p className="text-[10px] text-white/25 mt-2 text-center">&copy; 2026 SahamLens</p>
          )}
        </div>
      </aside>
    </>
  );
}
