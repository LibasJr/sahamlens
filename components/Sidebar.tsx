'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Activity,
  LineChart,
  Building2,
  GitCompare,
  Filter,
  Radar,
  Wallet,
  CalendarDays,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  User,
  Users,
  ShieldAlert,
  History,
  ShieldCheck,
  Newspaper,
  LogIn,
  FileSpreadsheet,
} from 'lucide-react';
import { defaultTicker, getTickerName } from '@/lib/trendingTickers';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import UserProfileModal from './UserProfileModal';

// Redesign Sidebar - Design System "Nucleus" (2026-07-31), + Role-Based Menu
// (2026-08-06). Menu tidak lagi sama untuk semua orang: yang tampil ditentukan
// role efektif dari useAuthUser() - GUEST 4 menu publik, TRIAL/PRO 12 menu,
// ADMIN 12 menu + grup Admin. Grouping per fungsi & satu ikon unik per tujuan
// dari redesign sebelumnya dipertahankan.
//
// CATATAN (2026-08-06): "LensWatch" (/watchlist) dan "Risk Calculator"
// (/risk-calculator) DIHAPUS dari sidebar atas permintaan produk - daftar 12
// menu TRIAL bersifat mengikat, dan dua ini tidak ada di dalamnya. Halamannya
// sendiri masih hidup & masih digerbang login (shared/constants/access.ts),
// cuma tidak punya link dari navigasi lagi.
interface NavItem {
  id: string;
  name: string;
  subtitle: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  live?: boolean;
  /** Terlihat oleh pengunjung yang belum login. Tanpa flag ini = butuh login
   * (TRIAL/PRO/ADMIN). Harus konsisten dengan PROTECTED_PAGES di
   * shared/constants/access.ts - kalau item guest menunjuk path terproteksi,
   * user diklik lalu langsung ditendang balik ke /login. */
  guest?: boolean;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'discover',
    label: 'Discover',
    items: [
      { id: 'home', name: 'Beranda', subtitle: 'LensAI & Ringkasan Akun', path: '/home', icon: LayoutDashboard, guest: true },
      { id: 'market-pulse', name: 'LensMarket', subtitle: 'Index, Sector & Breadth', path: '/market-pulse', icon: Activity, live: true, guest: true },
      { id: 'breakout-radar', name: 'LensRadar', subtitle: 'Breakout & Opportunity Scanner', path: '/breakout-radar', icon: Radar, live: true },
      { id: 'screener', name: 'LensScanner', subtitle: 'Filter Saham Multi-Faktor', path: '/screener', icon: Filter },
    ],
  },
  {
    id: 'analyze',
    label: 'Analyze',
    items: [
      { id: 'dashboard', name: 'LensTechnical', subtitle: '10 Pure Math Filters', path: '/dashboard', icon: LineChart },
      { id: 'fundamental', name: 'LensFundamental', subtitle: 'Value & Health Metrics', path: '/fundamental', icon: Building2 },
      { id: 'compare', name: 'Compare Tool', subtitle: 'Side-by-Side Analysis', path: '/compare', icon: GitCompare },
      { id: 'backtest', name: 'Backtest', subtitle: 'Simulasi Strategi dari Data Historis', path: '/backtest', icon: History },
    ],
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    items: [
      { id: 'council', name: 'LensAI', subtitle: 'Stock Analysis LensAI', path: '/technical/BBCA.JK', icon: Users },
    ],
  },
  {
    id: 'monitor',
    label: 'Monitor',
    items: [
      { id: 'portfolio', name: 'Akun Demo', subtitle: 'Paper Trading & P/L', path: '/portfolio', icon: Wallet },
      { id: 'calendar', name: 'Corporate Calendar', subtitle: 'Dividen, RUPS, & Corp Action', path: '/calendar', icon: CalendarDays, guest: true },
      { id: 'news', name: 'Berita', subtitle: 'Berita & Sentimen Pasar', path: '/news', icon: Newspaper, guest: true },
    ],
  },
];

// Hanya ditambahkan ke menu kalau akun punya role admin ATAU cookie admin dari
// /admin-login/key valid (lihat visibleGroups di bawah). Halaman /admin sendiri
// tetap digerbang isAdminServer(), jadi link ini cuma soal *penemuan* menu,
// bukan jalur akses baru.
const ADMIN_NAV_GROUP: NavGroup = {
  id: 'admin',
  label: 'Admin',
  items: [
    { id: 'transparency', name: 'Transparansi', subtitle: 'Validasi LensRadar publik', path: '/transparency', icon: ShieldCheck },
    { id: 'admin', name: 'Admin Panel', subtitle: 'Aktivasi Pro & User Aktif', path: '/admin', icon: ShieldAlert },
    { id: 'admin-calibration', name: 'Kalibrasi LensRadar', subtitle: 'T-test, Ambang & Bobot', path: '/admin/calibration', icon: LineChart },
    { id: 'admin-fundamental-backfill', name: 'Fundamental Backfill', subtitle: 'Upload CSV point-in-time', path: '/admin/fundamental-backfill', icon: FileSpreadsheet },
  ],
};

// Menu yang tampil per role. GUEST cuma item ber-flag guest; TRIAL/PRO semua 12
// item; ADMIN semua item + grup Admin (akses penuh, tanpa batasan). Grup yang
// jadi kosong dibuang supaya guest tidak melihat judul seksi tanpa isi.
function visibleGroupsFor(role: 'guest' | 'trial' | 'admin'): NavGroup[] {
  if (role === 'admin') return [...NAV_GROUPS, ADMIN_NAV_GROUP];
  if (role === 'trial') return NAV_GROUPS;
  return NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter((item) => item.guest) }))
    .filter((group) => group.items.length > 0);
}

const COLLAPSE_STORAGE_KEY = 'sahamlens_sidebar_collapsed';

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { loading: authLoading, user, effectiveRole, trialDaysLeft } = useAuthUser();
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const authChecked = !authLoading;
  // Link menu LensAI ikut emiten terakhir yang dicari user di Teknikal/Fundamental/DCF
  // (disimpan bersama di localStorage key 'last_searched_ticker') - supaya klik "LensAI"
  // membuka emiten yang sama. Kalau belum ada riwayat pencarian, pakai emiten default
  // yang TETAP - sebelumnya dipilih acak lewat pickTrendingTicker() yang menamai dirinya
  // "trending" tanpa pernah mengukur apa pun (audit 2026-08-05, temuan L-1).
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
    const handleOpenProfile = () => setShowProfileModal(true);
    window.addEventListener('open-profile-modal', handleOpenProfile);
    return () => window.removeEventListener('open-profile-modal', handleOpenProfile);
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  // hasAdminAccess = cookie admin dari /admin-login/key (akun tanpa role admin di DB
  // tapi sudah lolos verifikasi password admin) - tetap dihormati seperti sebelumnya.
  const role = hasAdminAccess ? 'admin' : effectiveRole;
  const visibleGroups = visibleGroupsFor(role);

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

  // Swipe dari tepi kiri layar (mobile) buka sidebar tanpa perlu tap ikon garis 3 -
  // pola umum di app native. Cuma dipasang kalau sidebar TERTUTUP (isOpen false),
  // supaya tidak mengganggu scroll/swipe biasa di dalam sidebar yang sudah terbuka.
  useEffect(() => {
    if (isOpen) return;
    const EDGE_ZONE_PX = 24; // swipe harus MULAI dekat tepi kiri, bukan dari tengah layar
    const MIN_SWIPE_PX = 60; // jarak geser horizontal minimal supaya tidak salah pencet
    let startX = 0;
    let startY = 0;
    let startedAtEdge = false;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startedAtEdge = startX <= EDGE_ZONE_PX;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!startedAtEdge) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = Math.abs(touch.clientY - startY);
      if (dx >= MIN_SWIPE_PX && dy < MIN_SWIPE_PX) {
        setIsOpen(true);
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isOpen]);

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
        className={`fixed inset-y-0 left-0 z-50 bg-tv-surface border-r border-tv-border flex flex-col h-screen select-none transform transition-all duration-300 ease-in-out md:relative md:translate-x-0 ${
          isOpen ? 'translate-x-0 shadow-2xl shadow-black/50' : '-translate-x-full'
        } ${isCollapsed ? 'md:w-20 w-72' : 'w-72'}`}
      >
        {/* Brand Header */}
        <div className={`border-b border-white/5 flex items-center bg-gradient-to-b from-white/[0.02] to-transparent ${isCollapsed ? 'md:justify-center md:px-2' : 'justify-between px-5'} py-5`}>
          <Link href="/" className="flex items-center gap-3 min-w-0">
            {/* BUG FIX (2026-08-05, permintaan user): icon "Rp" polos diganti icon "scope"
                (sahamlens-scope.png, sudah dipakai di CTA banner Dashboard.tsx) - gambar
                sumbernya landscape dengan bg putih, rounded-full + object-cover nge-crop
                jadi lingkaran (nutup sudut putihnya) konsisten sama style badge lama. */}
            <img src="/sahamlens-scope.png" alt="SahamLens" className="h-9 w-9 rounded-full shrink-0 object-cover" />
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
          {visibleGroups.map((group) => (
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
                  const href = item.id === 'council' ? `/technical/${councilTicker.symbol}.JK` : item.path;
                  const isActive = item.id === 'council' ? pathname.startsWith('/technical') : pathname === item.path;
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.id}
                      href={href}
                      onClick={() => window.dispatchEvent(new Event('close-sidebar'))}
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
                          isActive ? 'bg-tv-blue/10 text-tv-blue' : 'text-white/40 group-hover:text-white group-hover:scale-110'
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
                        <span className="hidden md:group-hover:flex absolute left-full ml-2 items-center whitespace-nowrap px-2.5 py-1.5 rounded-md bg-tv-cardAlt border border-tv-border text-white text-xs font-medium shadow-2 z-50 pointer-events-none">
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

        {/* Footer - akun & status feed */}
        <div className="p-3 border-t border-white/5 space-y-2">
          {user && (
            <div className={`flex items-center gap-2 rounded-lg bg-white/[0.03] ${isCollapsed ? 'md:justify-center md:px-0 px-2.5' : 'px-2.5'} py-2`}>
              <button
                type="button"
                onClick={() => setShowProfileModal(true)}
                title="Lihat detail profil"
                className={`flex items-center gap-2 flex-1 min-w-0 text-left rounded-md transition-colors hover:bg-white/[0.04] ${isCollapsed ? 'justify-center' : ''}`}
              >
                <div className="w-7 h-7 rounded-full bg-tv-blue/15 text-tv-blue flex items-center justify-center shrink-0">
                  <User className="w-3.5 h-3.5" />
                </div>
                <div className={`flex-1 min-w-0 ${isCollapsed ? 'md:hidden' : ''}`}>
                  <p className="text-xs font-medium text-white truncate">{user.email?.split('@')[0]}</p>
                  <p className="text-[9px] uppercase tracking-wide text-white/35">{user.role}</p>
                </div>
              </button>
              <button
                onClick={handleLogout}
                title="Logout"
                className={`shrink-0 p-1.5 rounded-md text-white/40 hover:text-tv-red hover:bg-tv-red/10 transition-colors ${isCollapsed ? 'md:hidden' : ''}`}
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {user && isCollapsed && (
            <button
              onClick={handleLogout}
              title="Logout"
              className="hidden md:flex w-full items-center justify-center p-2 rounded-md text-white/40 hover:text-tv-red hover:bg-tv-red/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}

          {/* Belum login (termasuk sesudah cookie hilang, mis. app di-uninstall lalu
              pasang ulang) - tanpa ini, tidak ada jalan sama sekali dari dalam Sidebar
              untuk mencapai /login, karena slot akun di atas kosong total kalau user null. */}
          {authChecked && !user && (
            <Link
              href="/login"
              onClick={() => window.dispatchEvent(new Event('close-sidebar'))}
              className={`flex items-center gap-2 rounded-lg bg-tv-blue/10 hover:bg-tv-blue/20 text-tv-blue transition-colors ${isCollapsed ? 'md:justify-center md:px-0 px-2.5' : 'px-2.5'} py-2`}
            >
              <LogIn className="w-3.5 h-3.5 shrink-0" />
              <span className={`text-xs font-medium ${isCollapsed ? 'md:hidden' : ''}`}>Masuk / Daftar</span>
            </Link>
          )}

          <div className={`flex items-center gap-1.5 text-[10px] text-white/35 ${isCollapsed ? 'md:hidden' : ''}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-tv-green animate-pulse shrink-0" />
            <span className="truncate">IDX Live Feed &middot; yfinance</span>
          </div>
          <span className={`hidden ${isCollapsed ? 'md:flex md:justify-center' : ''} w-1.5 h-1.5 rounded-full bg-tv-green animate-pulse`} />
          {!isCollapsed && (
            <>
              {/* Tagline filosofi brand (disepakati 2026-08-06) - baris kecil, tidak
                  menonjol, hadir di semua halaman lewat footer Sidebar ini. */}
              <p className="text-[10px] text-white/30 text-center italic">Memperjelas yang tersembunyi. Keputusan tetap milikmu.</p>
              <p className="text-[10px] text-white/25 text-center">&copy; 2026 SahamLens</p>
            </>
          )}
        </div>
      </aside>
      <UserProfileModal open={showProfileModal} onClose={closeProfileModal} />
    </>
  );
}
