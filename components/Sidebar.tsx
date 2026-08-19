'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
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
  Info,
  LayoutDashboard,
  LineChart,
  LockKeyhole,
  LogIn,
  LogOut,
  MessageSquare,
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
  Users,
  Wallet,
  Waves,
  Zap,
} from 'lucide-react';
import { defaultTicker, getTickerName } from '@/lib/trendingTickers';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import { isProtectedPage } from '@/shared/constants/access';
import { useLanguage } from '@/lib/i18n';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';

const UserProfileModal = dynamic(() => import('./UserProfileModal'), { ssr: false, loading: () => null });

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
    label: 'Utama',
    items: [
      { id: 'home', name: 'Beranda', subtitle: 'Snapshot market & akun', path: '/home', icon: LayoutDashboard, guest: true },
      { id: 'market-pulse', name: 'LensMarket', subtitle: 'Regime, IHSG & breadth', path: '/market-pulse', icon: Activity, live: true, guest: true, accent: 'green' },
      { id: 'breakout-radar', name: 'LensRadar', subtitle: 'Opportunity scanner', path: '/breakout-radar', icon: Radar, live: true, guest: true, accent: 'purple' },
    ],
  },
  {
    id: 'trading',
    label: 'Trading',
    items: [
      { id: 'dashboard', name: 'LensTechnical', subtitle: 'Trend, momentum & timing', path: '/dashboard', icon: LineChart },
      { id: 'screener', name: 'LensScanner', subtitle: 'Multi-factor stock screen', path: '/screener', icon: Filter },
      { id: 'compare', name: 'Compare', subtitle: 'Bandingkan multi-emiten', path: '/compare', icon: GitCompare },
      { id: 'backtest', name: 'Backtest', subtitle: 'Uji strategi historis', path: '/backtest', icon: History },
    ],
  },
  {
    id: 'investing',
    label: 'Investing',
    items: [
      { id: 'fundamental', name: 'LensFundamental', subtitle: 'Quality, growth & leverage', path: '/fundamental', icon: Building2 },
      { id: 'dcf', name: 'Valuation', subtitle: 'Intrinsic value & margin', path: '/dcf', icon: CircleDollarSign },
      { id: 'moat', name: 'Moat', subtitle: 'Competitive advantage', path: '/moat', icon: Target },
      { id: 'earnings', name: 'Earnings', subtitle: 'Preview & event monitor', path: '/earnings', icon: BarChart3 },
      { id: 'dividend', name: 'Dividend', subtitle: 'Yield & cash-flow simulator', path: '/dividend', icon: PieChart },
    ],
  },
  {
    id: 'risk-portfolio',
    label: 'Portfolio & Risiko',
    items: [
      { id: 'watchlist', name: 'LensWatch', subtitle: 'Watchlist & alerts', path: '/watchlist', icon: TrendingUp },
      { id: 'portfolio', name: 'Akun Demo', subtitle: 'Paper trading & P/L', path: '/portfolio', icon: Wallet },
      { id: 'risk', name: 'Risk Matrix', subtitle: 'Stress test portfolio', path: '/risk', icon: ShieldAlert },
      { id: 'risk-calculator', name: 'Risk Calculator', subtitle: 'Position sizing & R:R', path: '/risk-calculator', icon: Zap },
    ],
  },
  {
    id: 'research',
    label: 'Research & Lainnya',
    items: [
      // Ownership Flow - menu BARU (2026-08-16), BUKAN Broker Summary yang diganti
      // nama. Broker Summary tetap berada di grup Admin dan tetap nonaktif; keduanya
      // mengukur hal berbeda (lihat docs/ownership-flow/broker-vs-ownership.md).
      { id: 'ownership-flow', name: 'Ownership Flow', subtitle: 'Komposisi kepemilikan lokal & asing', path: '/ownership-flow', icon: Users, guest: true },
      { id: 'news', name: 'News & Sentiment', subtitle: 'Berita pasar terbaru', path: '/news', icon: Newspaper, guest: true },
      { id: 'calendar', name: 'Corporate Calendar', subtitle: 'Dividen, RUPS & aksi', path: '/calendar', icon: CalendarDays, guest: true },
      { id: 'macro', name: 'Macro', subtitle: 'Konteks makro Indonesia', path: '/macro', icon: Waves },
      { id: 'transparency', name: 'Transparansi', subtitle: 'Validasi & metodologi', path: '/transparency', icon: ShieldCheck, guest: true },
      // Halaman /about sudah lama ada tapi nyaris tidak bisa dicapai: satu-satunya jalan
      // dulu hanya tautan di landing yang ditandai `hidden sm:inline`, jadi tidak terlihat
      // sama sekali di HP. SiteFooter memperbaikinya sebagian; entri ini membuatnya benar-
      // benar setara dengan halaman lain. `guest: true` - tidak butuh akun untuk membaca
      // filosofi produk, justru pengunjung baru yang paling perlu.
      { id: 'about', name: 'Tentang', subtitle: 'Filosofi & prinsip aplikasi', path: '/about', icon: Info, guest: true },
    ],
  },
];

const ADMIN_NAV_GROUP: NavGroup = {
  id: 'admin',
  label: 'Admin',
  items: [
    { id: 'admin', name: 'Admin Panel', subtitle: 'User & subscription', path: '/admin', icon: ShieldAlert },
    { id: 'admin-jobs', name: 'Pemantau Cron', subtitle: 'Job terjadwal & kesehatannya', path: '/admin/jobs', icon: Activity },
    { id: 'admin-calibration', name: 'Kalibrasi LensRadar', subtitle: 'T-test, threshold & weight', path: '/admin/calibration', icon: BookOpenCheck },
    { id: 'admin-fundamental-backfill', name: 'Fundamental Backfill', subtitle: 'Upload PIT fundamental', path: '/admin/fundamental-backfill', icon: FileSpreadsheet },
    { id: 'admin-financial-integrity', name: 'Financial Integrity', subtitle: 'Adoption gate & maturity', path: '/admin/financial-integrity', icon: ShieldCheck },
    { id: 'admin-market-data-integrity', name: 'Market Data Integrity', subtitle: 'Rekonsiliasi harga lintas sumber', path: '/admin/data-integrity', icon: ShieldCheck },
    { id: 'admin-macro-pit', name: 'Macro PIT', subtitle: 'Risk-free, ERP & provenance', path: '/admin/macro-assumptions', icon: Waves },
    { id: 'admin-bank-fundamentals', name: 'Bank Fundamentals', subtitle: 'NIM, NPL, CASA, CAR & provenance', path: '/admin/bank-fundamentals', icon: Building2 },
    { id: 'admin-ownership-flow', name: 'Ownership Flow', subtitle: 'Status ingestion kepemilikan', path: '/admin/ownership-flow', icon: Users },
    { id: 'admin-lensai-feedback', name: 'Feedback LensAI', subtitle: 'Audit jawaban pengguna', path: '/admin/lensai-feedback', icon: MessageSquare },
  ],
};

function visibleGroupsFor(role: 'guest' | 'trial' | 'admin'): NavGroup[] {
  if (role === 'admin') return [...NAV_GROUPS, ADMIN_NAV_GROUP];
  // Guest tetap dapat melihat seluruh fitur pengguna agar tahu cakupan produk.
  // Aksesnya tidak dibuka: item tanpa `guest: true` dikunci saat diklik di bawah.
  return NAV_GROUPS;
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
  const { loading: authLoading, user, resolved: authResolved, effectiveRole } = useAuthUser();
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [councilTicker, setCouncilTicker] = useState(() => defaultTicker());
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [hoveredNav, setHoveredNav] = useState<{ label: string; top: number; locked: boolean } | null>(null);
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

  const { t } = useLanguage();

  const getLocalizedGroupName = useCallback((id: string, defaultLabel: string) => {
    switch (id) {
      case 'overview': return t('nav.groupMain');
      case 'trading': return t('nav.groupTrading');
      case 'investing': return t('nav.groupInvesting');
      case 'risk-portfolio': return t('nav.groupRiskPortfolio');
      case 'research': return t('nav.groupResearch');
      case 'admin': return t('nav.groupAdmin');
      default: return defaultLabel;
    }
  }, [t]);

  const getLocalizedItem = useCallback((id: string, defaultName: string, defaultSub: string) => {
    switch (id) {
      case 'home': return { name: t('nav.home'), subtitle: t('nav.homeSub') };
      case 'market-pulse': return { name: t('nav.marketPulse'), subtitle: t('nav.marketPulseSub') };
      case 'breakout-radar': return { name: t('nav.radar'), subtitle: t('nav.radarSub') };
      case 'dashboard': return { name: t('nav.technical'), subtitle: t('nav.technicalSub') };
      case 'screener': return { name: t('nav.screener'), subtitle: t('nav.screenerSub') };
      case 'compare': return { name: t('nav.compare'), subtitle: t('nav.compareSub') };
      case 'backtest': return { name: t('nav.backtest'), subtitle: t('nav.backtestSub') };
      case 'fundamental': return { name: t('nav.fundamental'), subtitle: t('nav.fundamentalSub') };
      case 'dcf': return { name: t('nav.dcf'), subtitle: t('nav.dcfSub') };
      case 'moat': return { name: t('nav.moat'), subtitle: t('nav.moatSub') };
      case 'earnings': return { name: t('nav.earnings'), subtitle: t('nav.earningsSub') };
      case 'dividend': return { name: t('nav.dividend'), subtitle: t('nav.dividendSub') };
      case 'watchlist': return { name: t('nav.watchlist'), subtitle: t('nav.watchlistSub') };
      case 'portfolio': return { name: t('nav.portfolio'), subtitle: t('nav.portfolioSub') };
      case 'risk': return { name: t('nav.risk'), subtitle: t('nav.riskSub') };
      case 'risk-calculator': return { name: t('nav.riskCalculator'), subtitle: t('nav.riskCalculatorSub') };
      case 'ownership-flow': return { name: t('nav.ownershipFlow'), subtitle: t('nav.ownershipFlowSub') };
      case 'news': return { name: t('nav.news'), subtitle: t('nav.newsSub') };
      case 'calendar': return { name: t('nav.calendar'), subtitle: t('nav.calendarSub') };
      case 'macro': return { name: t('nav.macro'), subtitle: t('nav.macroSub') };
      case 'transparency': return { name: t('nav.transparency'), subtitle: t('nav.transparencySub') };
      case 'about': return { name: t('nav.about'), subtitle: t('nav.aboutSub') };
      default: return { name: defaultName, subtitle: defaultSub };
    }
  }, [t]);

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
          aria-label={t('common.close')}
          className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh flex-col border-r border-white/[0.07] bg-[#090E18]/98 shadow-[18px_0_60px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-all duration-300 md:relative md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isCollapsed ? 'w-[min(22rem,calc(100vw-1rem))] md:w-[76px]' : 'w-[min(22rem,calc(100vw-1rem))] md:w-[292px]'}`}
      >
        <div className={`flex h-[72px] items-center border-b border-white/[0.06] ${isCollapsed ? 'md:justify-center md:px-2' : 'justify-between px-4'}`}>
          <Link href="/" className="group flex min-w-0 items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-inner p-1">
              <Image src="/sahamlens-logo.png" alt="SahamLens" fill sizes="40px" className="object-contain" />
            </div>
            <div className={isCollapsed ? 'md:hidden' : ''}>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-white md:text-[15px]">SahamLens</span>
                <span className="rounded-full border border-tv-blue/20 bg-tv-blue/10 px-1.5 py-0.5 text-[12px] font-bold uppercase tracking-[0.14em] text-tv-blue md:text-[10px] md:tracking-[0.16em]">Beta</span>
              </div>
              <p className="mt-0.5 text-xs font-medium text-tv-muted md:text-[10px]">Intelligence for IDX investors</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={toggleCollapse}
            className={`hidden h-8 w-8 items-center justify-center rounded-xl text-tv-muted transition-colors hover:bg-white/[0.06] hover:text-white md:flex ${isCollapsed ? 'absolute left-[22px] top-[80px]' : ''}`}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        <div className={`flex-1 overflow-y-auto overflow-x-visible py-4 ${isCollapsed ? 'md:px-2 px-3' : 'px-3'}`}>
          <div className="space-y-5">
            {visibleGroups.map((group) => (
              <section key={group.id}>
                <div className={`mb-2 px-2.5 text-xs font-bold uppercase tracking-[0.14em] text-white/55 md:text-[11px] md:tracking-[0.16em] ${isCollapsed ? 'md:hidden' : ''}`}>
                  {getLocalizedGroupName(group.id, group.label)}
                </div>
                {isCollapsed && <div className="mx-2 mb-2 hidden border-t border-white/[0.06] md:block" />}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const localized = getLocalizedItem(item.id, item.name, item.subtitle);
                    const targetHref = item.id === 'lensai' ? `/technical/${councilTicker.symbol}.JK` : item.path;
                    const active = isPathActive(pathname, item);
                    const lockedForGuest = !authLoading && authResolved && !user && role === 'guest' && isProtectedPage(item.path);
                    const href = lockedForGuest
                      ? `/login-required?next=${encodeURIComponent(targetHref)}&feature=${encodeURIComponent(localized.name)}`
                      : targetHref;
                    const Icon = item.icon;
                    const accentClass = item.accent ? ACCENT_CLASS[item.accent] : 'text-white/45 bg-white/[0.03]';
                    return (
                      <Link
                        key={item.id}
                        href={href}
                        title={lockedForGuest ? `${localized.name} - ${t('nav.loginRequired')}` : localized.name}
                        aria-label={lockedForGuest ? `${localized.name}, ${t('nav.loginRequired')}` : localized.name}
                        onClick={() => setIsOpen(false)}
                        onMouseEnter={(event) => {
                          if (!isCollapsed) return;
                          const rect = event.currentTarget.getBoundingClientRect();
                          setHoveredNav({
                            label: localized.name,
                            top: rect.top + rect.height / 2,
                            locked: lockedForGuest,
                          });
                        }}
                        onMouseLeave={() => setHoveredNav(null)}
                        onFocus={(event) => {
                          if (!isCollapsed) return;
                          const rect = event.currentTarget.getBoundingClientRect();
                          setHoveredNav({
                            label: localized.name,
                            top: rect.top + rect.height / 2,
                            locked: lockedForGuest,
                          });
                        }}
                        onBlur={() => setHoveredNav(null)}
                        className={`group relative flex min-h-14 items-center rounded-xl md:min-h-[46px] transition-all duration-200 ${
                          isCollapsed ? 'md:justify-center md:px-0 px-2.5' : 'px-2.5'
                        } ${active ? 'bg-white/[0.075] text-white' : 'text-white/70 hover:bg-white/[0.045] hover:text-white'} ${
                          lockedForGuest ? 'cursor-pointer' : ''
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="sidebar-active"
                            className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-gradient-to-b from-tv-blue to-tv-purple"
                            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
                          />
                        )}
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl md:h-8 md:w-8 transition-all ${active ? 'bg-tv-blue/[0.12] text-tv-blue' : accentClass}`}>
                          <Icon className="h-[18px] w-[18px] md:h-[16px] md:w-[16px]" />
                        </span>
                        <span className={`ml-2.5 min-w-0 flex-1 ${isCollapsed ? 'md:hidden' : ''}`}>
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-semibold md:text-[13px] text-white/95">{localized.name}</span>
                            {item.live && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-tv-green shadow-[0_0_8px_rgba(35,196,131,0.9)]" />}
                          </span>
                          <span className="mt-0.5 block whitespace-normal break-words text-xs font-medium leading-snug text-white/60 md:truncate md:text-[11.5px] md:leading-normal md:text-white/50">{localized.subtitle}</span>
                        </span>
                        {!isCollapsed && lockedForGuest && (
                          <LockKeyhole className="h-4 w-4 shrink-0 text-tv-muted" aria-hidden="true" />
                        )}
                        {!isCollapsed && active && !lockedForGuest && <ChevronRight className="h-3.5 w-3.5 text-white/30" />}
                        {isCollapsed && lockedForGuest && (
                          <span className="absolute right-1.5 top-1.5 hidden h-4 w-4 items-center justify-center rounded-full border border-tv-border bg-tv-card text-tv-muted md:flex">
                            <LockKeyhole className="h-2.5 w-2.5" aria-hidden="true" />
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
        {isCollapsed && hoveredNav && (
          <div
            className="pointer-events-none fixed left-[86px] z-[100] hidden -translate-y-1/2 items-center rounded-xl border border-white/10 bg-[#111A29] px-3 py-2 text-xs font-semibold text-white shadow-2xl md:flex"
            style={{ top: hoveredNav.top }}
          >
            <span className="absolute -left-1.5 h-3 w-3 rotate-45 border-b border-l border-white/10 bg-[#111A29]" aria-hidden="true" />
            <span className="relative">
              {hoveredNav.label}{hoveredNav.locked ? ` · ${t('nav.loginRequired')}` : ''}
            </span>
          </div>
        )}

        <div className="border-t border-white/[0.06] p-3">
          <LanguageSwitcher variant="sidebar" className={`mb-2.5 ${isCollapsed ? 'md:hidden' : ''}`} />
          {hasAdminAccess && (
            <Link
              href="/admin/infographic-studio"
              className={`mb-2.5 flex items-center gap-2 rounded-xl border border-tv-blue/30 bg-tv-blue/10 p-2 text-xs font-bold text-tv-blue hover:bg-tv-blue/20 transition-all ${
                isCollapsed ? 'md:justify-center md:p-1.5' : 'justify-between'
              }`}
              title="Infographic Studio (Admin)"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-tv-gold shrink-0" />
                <span className={isCollapsed ? 'md:hidden' : ''}>Infographic Studio</span>
              </span>
              <span className={`rounded bg-tv-blue/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${isCollapsed ? 'md:hidden' : ''}`}>Admin</span>
            </Link>
          )}
          {!authLoading && user ? (
            <div className={`rounded-2xl border border-white/[0.06] bg-white/[0.025] p-2 ${isCollapsed ? 'md:border-transparent md:bg-transparent md:p-0' : ''}`}>
              <div className={`flex items-center gap-2 ${isCollapsed ? 'md:justify-center' : ''}`}>
                <button
                  type="button"
                  onClick={() => setShowProfileModal(true)}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl p-1.5 text-left transition-colors hover:bg-white/[0.04] ${isCollapsed ? 'md:flex-none md:p-1' : ''}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl md:h-8 md:w-8 bg-gradient-to-br from-tv-blue/25 to-tv-purple/20 text-tv-blue">
                    <User className="h-4 w-4" />
                  </span>
                  <span className={`min-w-0 flex-1 ${isCollapsed ? 'md:hidden' : ''}`}>
                    <span className="block truncate text-sm font-semibold text-white md:text-xs">{user.email?.split('@')[0]}</span>
                    <span className="mt-0.5 block text-xs font-bold uppercase tracking-wider text-tv-muted md:text-[10px]">{user.role}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  title={t('nav.logout')}
                  className={`rounded-xl p-2 text-tv-muted transition-colors hover:bg-tv-red/10 hover:text-tv-red ${isCollapsed ? 'md:hidden' : ''}`}
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : !authLoading ? (
            <Link href="/login" className={`flex items-center gap-2 rounded-2xl border border-tv-blue/15 bg-tv-blue/10 p-2.5 font-semibold text-tv-blue transition-colors hover:bg-tv-blue/15 ${isCollapsed ? 'md:justify-center md:px-0' : ''}`}>
              <LogIn className="h-4 w-4 shrink-0" />
              <span className={`text-sm ${isCollapsed ? 'md:hidden' : ''}`}>{t('nav.login')}</span>
            </Link>
          ) : null}

          <div className={`mt-2.5 flex items-center justify-between px-1 text-[10px] font-medium text-white/25 ${isCollapsed ? 'md:hidden' : ''}`}>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-tv-green" /> {t('nav.idxConnected')}</span>
            <span>{t('nav.v2Ui')}</span>
          </div>
        </div>
      </aside>
      <UserProfileModal open={showProfileModal} onClose={closeProfileModal} />
    </>
  );
}
