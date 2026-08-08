'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  BookOpenCheck,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  FileSpreadsheet,
  Filter,
  GitCompare,
  History,
  LayoutDashboard,
  LineChart,
  LogIn,
  LogOut,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  User,
  Wallet,
  Waves,
  Zap,
} from 'lucide-react';
import { defaultTicker, getTickerName } from '@/lib/trendingTickers';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import UserProfileModal from './UserProfileModal';

interface NavItem {
  id: string;
  name: string;
  subtitle: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  guest?: boolean;
  live?: boolean;
  accent?: 'blue' | 'purple' | 'green' | 'gold';
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      { id: 'home', name: 'Beranda', subtitle: 'Snapshot market & akun', path: '/home', icon: LayoutDashboard, guest: true },
      { id: 'market-pulse', name: 'LensMarket', subtitle: 'IHSG, sector & breadth', path: '/market-pulse', icon: Activity, live: true, guest: true, accent: 'green' },
      { id: 'breakout-radar', name: 'LensRadar', subtitle: 'Opportunity scanner', path: '/breakout-radar', icon: Radar, live: true, guest: true, accent: 'purple' },
      { id: 'lensai', name: 'LensAI', subtitle: 'Copilot analisis saham', path: '/technical/BBCA.JK', icon: Sparkles, accent: 'purple' },
    ],
  },
  {
    id: 'analyze',
    label: 'Analyze',
    items: [
      { id: 'dashboard', name: 'LensTechnical', subtitle: 'Trend, momentum & timing', path: '/dashboard', icon: LineChart },
      { id: 'fundamental', name: 'LensFundamental', subtitle: 'Quality, growth & leverage', path: '/fundamental', icon: Building2 },
      { id: 'dcf', name: 'Valuation', subtitle: 'Intrinsic value & margin', path: '/dcf', icon: CircleDollarSign },
      { id: 'compare', name: 'Compare', subtitle: 'Bandingkan multi-emiten', path: '/compare', icon: GitCompare },
      { id: 'screener', name: 'LensScanner', subtitle: 'Multi-factor stock screen', path: '/screener', icon: Filter, guest: true },
      { id: 'backtest', name: 'Backtest', subtitle: 'Uji strategi historis', path: '/backtest', icon: History },
    ],
  },
  {
    id: 'research',
    label: 'Research',
    items: [
      { id: 'news', name: 'News & Sentiment', subtitle: 'Berita pasar terbaru', path: '/news', icon: Newspaper, guest: true },
      { id: 'calendar', name: 'Corporate Calendar', subtitle: 'Dividen, RUPS & aksi', path: '/calendar', icon: CalendarDays, guest: true },
      { id: 'earnings', name: 'Earnings', subtitle: 'Preview & event monitor', path: '/earnings', icon: BarChart3 },
      { id: 'dividend', name: 'Dividend', subtitle: 'Yield & cash-flow simulator', path: '/dividend', icon: PieChart },
      { id: 'macro', name: 'Macro', subtitle: 'Konteks makro Indonesia', path: '/macro', icon: Waves },
      { id: 'moat', name: 'Moat', subtitle: 'Competitive advantage', path: '/moat', icon: Target },
      { id: 'transparency', name: 'Transparansi', subtitle: 'Validasi & metodologi', path: '/transparency', icon: ShieldCheck, guest: true },
    ],
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    items: [
      { id: 'portfolio', name: 'Akun Demo', subtitle: 'Paper trading & P/L', path: '/portfolio', icon: Wallet },
      { id: 'watchlist', name: 'LensWatch', subtitle: 'Watchlist & alerts', path: '/watchlist', icon: TrendingUp },
      { id: 'risk', name: 'Risk Matrix', subtitle: 'Stress test portfolio', path: '/risk', icon: ShieldAlert },
      { id: 'risk-calculator', name: 'Risk Calculator', subtitle: 'Position sizing & R:R', path: '/risk-calculator', icon: Zap },
    ],
  },
];

const ADMIN_NAV_GROUP: NavGroup = {
  id: 'admin',
  label: 'Admin',
  items: [
    { id: 'admin', name: 'Admin Panel', subtitle: 'User & subscription', path: '/admin', icon: ShieldAlert },
    { id: 'admin-calibration', name: 'Kalibrasi LensRadar', subtitle: 'T-test, threshold & weight', path: '/admin/calibration', icon: BookOpenCheck },
    { id: 'admin-fundamental-backfill', name: 'Fundamental Backfill', subtitle: 'Upload PIT fundamental', path: '/admin/fundamental-backfill', icon: FileSpreadsheet },
  ],
};

function visibleGroupsFor(role: 'guest' | 'trial' | 'admin'): NavGroup[] {
  if (role === 'admin') return [...NAV_GROUPS, ADMIN_NAV_GROUP];
  if (role === 'trial') return NAV_GROUPS;
  return NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter((item) => item.guest) }))
    .filter((group) => group.items.length > 0);
}

const COLLAPSE_STORAGE_KEY = 'sahamlens_sidebar_collapsed';

const ACCENT_CLASS: Record<NonNullable<NavItem['accent']>, string> = {
  blue: 'text-tv-blue bg-tv-blue/10',
  purple: 'text-tv-purple bg-tv-purple/10',
  green: 'text-tv-green bg-tv-green/10',
  gold: 'text-tv-yellow bg-tv-yellow/10',
};

function isPathActive(pathname: string, item: NavItem) {
  if (item.id === 'lensai') return pathname.startsWith('/technical/');
  if (item.path === '/home') return pathname === '/home';
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
}

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { loading: authLoading, user, effectiveRole } = useAuthUser();
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [councilTicker, setCouncilTicker] = useState(() => defaultTicker());
  const [showProfileModal, setShowProfileModal] = useState(false);
  const closeProfileModal = useCallback(() => setShowProfileModal(false), []);

  useEffect(() => {
    const saved = window.localStorage.getItem('last_searched_ticker');
    if (saved) {
      const symbol = saved.replace('.JK', '').toUpperCase();
      setCouncilTicker({ symbol, name: getTickerName(symbol) });
    }
  }, [pathname]);

  useEffect(() => {
    fetch('/api/admin-status')
      .then((res) => res.json())
      .then((d) => setHasAdminAccess(Boolean(d.isAdmin)))
      .catch(() => setHasAdminAccess(false));
  }, []);

  useEffect(() => {
    const onToggle = () => setIsOpen((prev) => !prev);
    const onClose = () => setIsOpen(false);
    const onOpenProfile = () => setShowProfileModal(true);
    window.addEventListener('toggle-sidebar', onToggle);
    window.addEventListener('close-sidebar', onClose);
    window.addEventListener('open-profile-modal', onOpenProfile);
    return () => {
      window.removeEventListener('toggle-sidebar', onToggle);
      window.removeEventListener('close-sidebar', onClose);
      window.removeEventListener('open-profile-modal', onOpenProfile);
    };
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (stored === 'true') setIsCollapsed(true);
  }, []);

  useEffect(() => {
    if (isOpen) return;
    const EDGE_ZONE_PX = 24;
    const MIN_SWIPE_PX = 60;
    let startX = 0;
    let startY = 0;
    let startedAtEdge = false;

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startedAtEdge = startX <= EDGE_ZONE_PX;
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (!startedAtEdge) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = Math.abs(touch.clientY - startY);
      if (dx >= MIN_SWIPE_PX && dy < MIN_SWIPE_PX) setIsOpen(true);
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [isOpen]);

  const role: 'guest' | 'trial' | 'admin' = hasAdminAccess ? 'admin' : effectiveRole;
  const visibleGroups = useMemo(() => visibleGroupsFor(role), [role]);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      return next;
    });
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Tutup menu"
          className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r border-white/[0.07] bg-[#090E18]/98 shadow-[18px_0_60px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-all duration-300 md:relative md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isCollapsed ? 'w-[292px] md:w-[76px]' : 'w-[292px]'}`}
      >
        <div className={`flex h-[72px] items-center border-b border-white/[0.06] ${isCollapsed ? 'md:justify-center md:px-2' : 'justify-between px-4'}`}>
          <Link href="/home" className="group flex min-w-0 items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-inner">
              <Image src="/sahamlens-scope.png" alt="SahamLens" fill sizes="40px" className="object-cover" />
            </div>
            <div className={isCollapsed ? 'md:hidden' : ''}>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold tracking-tight text-white">SahamLens</span>
                <span className="rounded-full border border-tv-blue/20 bg-tv-blue/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-tv-blue">Beta</span>
              </div>
              <p className="mt-0.5 text-[10px] font-medium text-tv-muted">Intelligence for IDX investors</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={toggleCollapse}
            className={`hidden h-8 w-8 items-center justify-center rounded-xl text-tv-muted transition-colors hover:bg-white/[0.06] hover:text-white md:flex ${isCollapsed ? 'absolute left-[22px] top-[80px]' : ''}`}
            title={isCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
            aria-label={isCollapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          >
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        <div className={`flex-1 overflow-y-auto overflow-x-visible py-4 ${isCollapsed ? 'md:px-2 px-3' : 'px-3'}`}>
          <div className="space-y-5">
            {visibleGroups.map((group) => (
              <section key={group.id}>
                <div className={`mb-1.5 px-2 text-[9px] font-bold uppercase tracking-[0.18em] text-white/30 ${isCollapsed ? 'md:hidden' : ''}`}>
                  {group.label}
                </div>
                {isCollapsed && <div className="mx-2 mb-2 hidden border-t border-white/[0.06] md:block" />}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const href = item.id === 'lensai' ? `/technical/${councilTicker.symbol}.JK` : item.path;
                    const active = isPathActive(pathname, item);
                    const Icon = item.icon;
                    const accentClass = item.accent ? ACCENT_CLASS[item.accent] : 'text-white/45 bg-white/[0.03]';
                    return (
                      <Link
                        key={item.id}
                        href={href}
                        onClick={() => setIsOpen(false)}
                        className={`group relative flex min-h-[46px] items-center rounded-xl transition-all duration-200 ${
                          isCollapsed ? 'md:justify-center md:px-0 px-2.5' : 'px-2.5'
                        } ${active ? 'bg-white/[0.075] text-white' : 'text-white/65 hover:bg-white/[0.045] hover:text-white'}`}
                      >
                        {active && (
                          <motion.span
                            layoutId="sidebar-active"
                            className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-gradient-to-b from-tv-blue to-tv-purple"
                            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
                          />
                        )}
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all ${active ? 'bg-tv-blue/[0.12] text-tv-blue' : accentClass}`}>
                          <Icon className="h-[16px] w-[16px]" />
                        </span>
                        <span className={`ml-2.5 min-w-0 flex-1 ${isCollapsed ? 'md:hidden' : ''}`}>
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[12.5px] font-semibold">{item.name}</span>
                            {item.live && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-tv-green shadow-[0_0_8px_rgba(35,196,131,0.9)]" />}
                          </span>
                          <span className="mt-0.5 block truncate text-[9.5px] font-medium text-white/32">{item.subtitle}</span>
                        </span>
                        {!isCollapsed && active && <ChevronRight className="h-3.5 w-3.5 text-white/30" />}
                        {isCollapsed && (
                          <span className="pointer-events-none absolute left-full z-[80] ml-3 hidden min-w-max items-center rounded-xl border border-white/10 bg-[#111A29] px-3 py-2 text-xs font-semibold text-white shadow-2xl md:group-hover:flex">
                            {item.name}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>

        <div className="border-t border-white/[0.06] p-3">
          {!authLoading && user ? (
            <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.025] p-2 ${isCollapsed ? 'md:border-transparent md:bg-transparent md:p-0' : ''}`}>
              <div className={`flex items-center gap-2 ${isCollapsed ? 'md:justify-center' : ''}`}>
                <button
                  type="button"
                  onClick={() => setShowProfileModal(true)}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl p-1.5 text-left transition-colors hover:bg-white/[0.04] ${isCollapsed ? 'md:flex-none md:p-1' : ''}`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-tv-blue/25 to-tv-purple/20 text-tv-blue">
                    <User className="h-4 w-4" />
                  </span>
                  <span className={`min-w-0 flex-1 ${isCollapsed ? 'md:hidden' : ''}`}>
                    <span className="block truncate text-xs font-semibold text-white">{user.email?.split('@')[0]}</span>
                    <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-wider text-tv-muted">{user.role}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Keluar"
                  className={`rounded-xl p-2 text-tv-muted transition-colors hover:bg-tv-red/10 hover:text-tv-red ${isCollapsed ? 'md:hidden' : ''}`}
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : !authLoading ? (
            <Link href="/login" className={`flex items-center gap-2 rounded-2xl border border-tv-blue/15 bg-tv-blue/10 p-2.5 font-semibold text-tv-blue transition-colors hover:bg-tv-blue/15 ${isCollapsed ? 'md:justify-center md:px-0' : ''}`}>
              <LogIn className="h-4 w-4 shrink-0" />
              <span className={`text-xs ${isCollapsed ? 'md:hidden' : ''}`}>Masuk / Daftar</span>
            </Link>
          ) : null}

          <div className={`mt-2.5 flex items-center justify-between px-1 text-[9px] font-medium text-white/25 ${isCollapsed ? 'md:hidden' : ''}`}>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-tv-green" /> IDX data connected</span>
            <span>v2 UI</span>
          </div>
        </div>
      </aside>
      <UserProfileModal open={showProfileModal} onClose={closeProfileModal} />
    </>
  );
}
