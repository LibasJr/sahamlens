'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  BookOpenCheck,
  Brain,
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
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import { isProtectedPage } from '@/shared/constants/access';
import { useLanguage } from '@/lib/i18n';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import { apiRequest } from '@/shared/http/api-client';

const UserProfileModal = dynamic(() => import('./UserProfileModal'), { ssr: false, loading: () => null });

export interface NavItem {
  id: string;
  name: string;
  subtitle: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  guest?: boolean;
  live?: boolean;
  accent?: 'blue' | 'purple' | 'green' | 'gold';
  /** Nama event window yang dikirim saat diklik, untuk kemampuan yang berupa panel dan
   *  bukan halaman. Item ber-`action` dirender sebagai tombol, bukan tautan - menautkan
   *  sesuatu yang tidak punya URL adalah janji yang tidak bisa ditepati (tautan yang
   *  bisa dibuka di tab baru, di-bookmark, atau dibagikan). */
  action?: string;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Utama',
    items: [
      { id: 'home', name: 'Beranda', subtitle: 'Konteks pasar, peluang, dan hal yang perlu diperhatikan', path: '/', icon: LayoutDashboard, guest: true },
      { id: 'market-pulse', name: 'LensMarket', subtitle: 'Arah IHSG, breadth, regime, dan kekuatan sektor', path: '/market-pulse', icon: Activity, live: true, guest: true, accent: 'green' },
      { id: 'breakout-radar', name: 'LensRadar', subtitle: 'Kandidat yang layak diperiksa dari pemindaian sesi', path: '/breakout-radar', icon: Radar, live: true, guest: true, accent: 'purple' },
      { id: 'watchlist', name: 'LensWatch', subtitle: 'Pantau saham pilihan dan alert penting', path: '/watchlist', icon: TrendingUp },
    ],
  },
  {
    id: 'research',
    label: 'Riset',
    items: [
      { id: 'dashboard', name: 'LensTechnical', subtitle: 'Tren, momentum, flow, dan bukti teknikal', path: '/dashboard', icon: LineChart },
      { id: 'fundamental', name: 'LensFundamental', subtitle: 'Kualitas bisnis, pertumbuhan, neraca, dan profitabilitas', path: '/fundamental', icon: Building2 },
      { id: 'ownership-flow', name: 'Ownership Flow', subtitle: 'Komposisi kepemilikan lokal dan asing', path: '/ownership-flow', icon: Users, guest: true },
      { id: 'compare', name: 'Compare', subtitle: 'Bandingkan beberapa emiten berdampingan', path: '/compare', icon: GitCompare },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    items: [
      { id: 'screener', name: 'LensScanner', subtitle: 'Saring saham dari banyak faktor sekaligus', path: '/screener', icon: Filter },
      { id: 'dcf', name: 'Valuation', subtitle: 'Nilai wajar dan margin keamanan', path: '/dcf', icon: CircleDollarSign },
      { id: 'backtest', name: 'Backtest', subtitle: 'Uji strategi pada data historis', path: '/backtest', icon: History },
      { id: 'risk', name: 'Risk Matrix', subtitle: 'Uji ketahanan portofolio terhadap guncangan', path: '/risk', icon: ShieldAlert },
      { id: 'risk-calculator', name: 'Risk Calculator', subtitle: 'Hitung ukuran posisi dan rasio risiko', path: '/risk-calculator', icon: Zap },
      { id: 'portfolio', name: 'Akun Demo', subtitle: 'Latihan transaksi tanpa uang sungguhan', path: '/portfolio', icon: Wallet },
      { id: 'moat', name: 'Moat', subtitle: 'Ukur daya tahan keunggulan bersaing emiten', path: '/moat', icon: Target },
      { id: 'earnings', name: 'Earnings', subtitle: 'Pantau jadwal dan hasil laba', path: '/earnings', icon: BarChart3 },
      { id: 'dividend', name: 'Dividend', subtitle: 'Simulasi imbal hasil dan arus kas dividen', path: '/dividend', icon: PieChart },
    ],
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    items: [
      // LensAI ada di daftar ini karena arsitektur navigasi menempatkannya di
      // INTELLIGENCE (PRD §7) - kemampuan yang hanya bisa ditemukan lewat tombol
      // melayang praktis tidak ditemukan sama sekali oleh pengguna baru.
      //
      // `action` alih-alih `path`: LensAI adalah PANEL, bukan halaman. Versi sebelumnya
      // menyiasatinya dengan menautkannya ke /technical/<ticker terakhir> - tautan yang
      // membuka halaman yang berbeda dari namanya. Item beraksi membuka panelnya
      // langsung, dari halaman mana pun, tanpa memindahkan pengguna.
      { id: 'lensai', name: 'LensAI Research', subtitle: 'Tanya konteks, risiko, dan alasan di balik angka', path: '', icon: Sparkles, guest: true, accent: 'purple', action: 'open-ai-chat' },
      { id: 'news', name: 'News & Sentiment', subtitle: 'Berita pasar dan konteks sentimen terbaru', path: '/news', icon: Newspaper, guest: true },
      { id: 'calendar', name: 'Corporate Calendar', subtitle: 'Dividen, RUPS, earnings, dan aksi korporasi', path: '/calendar', icon: CalendarDays, guest: true },
      { id: 'macro', name: 'Macro', subtitle: 'Konteks ekonomi makro Indonesia', path: '/macro', icon: Waves },
      { id: 'about', name: 'Tentang', subtitle: 'Filosofi dan prinsip SahamLens', path: '/about', icon: Info, guest: true },
      { id: 'transparency', name: 'Transparansi', subtitle: 'Metodologi, status model, sampel, dan batasan', path: '/transparency', icon: ShieldCheck, guest: true },
    ],
  },
];

/**
 * Grup yang terbuka sebelum pengguna menyentuh apa pun. Sisanya (tools, intelligence,
 * admin) mulai tertutup - daftarnya panjang dan jarang dipakai sekaligus.
 *
 * Ini NILAI AWAL, bukan aturan. Begitu pengguna mengklik kepala grup, pilihannya
 * disimpan di `expandedGroups` dan menang atas nilai di sini.
 */
const GRUP_TERBUKA_AWAL = new Set(['overview', 'research']);

/**
 * Apakah isi sebuah grup ditampilkan.
 *
 * `pilihan[id]` yang `undefined` berarti pengguna belum menyentuh grup itu, jadi nilai
 * awalnya yang dipakai. Begitu ia mengklik, nilainya eksplisit dan MENANG - termasuk
 * atas grup yang memuat halaman yang sedang dibuka.
 *
 * Versi sebelumnya meng-OR `groupHasActiveItem` ke sini, sehingga grup yang sedang
 * dipakai tidak pernah bisa ditutup sama sekali: chevron-nya berputar, isinya tetap.
 */
export function grupTerbuka(id: string, pilihan: Record<string, boolean>): boolean {
  return pilihan[id] ?? GRUP_TERBUKA_AWAL.has(id);
}

/**
 * Kelas visibilitas isi grup.
 *
 * `isCollapsed` (mode rail) SENGAJA tidak lagi ikut menentukan `grupTerbuka`. Ia keadaan
 * khusus desktop - seluruh pemakaiannya di className digandeng `md:` (lebar rail
 * `md:w-[76px]`, tombolnya `md:flex`, kepala grup `md:hidden`), sementara di HP drawer
 * selalu lebar penuh. Tetapi nilainya disimpan di localStorage dan dibaca sebagai boolean
 * mentah, jadi sekali pengguna men-collapse sidebar di desktop, di PONSEL setiap grup
 * ikut dipaksa terbuka dan tidak satu pun bisa ditutup - fiturnya mati total di HP.
 *
 * Karena itu penjaganya dipindah ke CSS, di breakpoint yang sama dengan rail-nya:
 * grup tertutup disembunyikan di mana saja, KECUALI di md+ saat rail aktif - di sana
 * kepala grupnya tidak dirender, jadi isinya harus tetap tampil sebagai ikon supaya
 * tidak ada grup yang mustahil dibuka lagi.
 */
export function kelasIsiGrup(terbuka: boolean, sidebarCiut: boolean): string {
  if (terbuka) return '';
  return sidebarCiut ? 'hidden md:block' : 'hidden';
}

/**
 * Balik keadaan satu grup. Dihitung dari keadaan EFEKTIF, bukan langsung dari
 * `pilihan[id]`: untuk grup yang default-nya terbuka nilai itu masih `undefined`, dan
 * `!undefined` bernilai `true` - klik pertama akan menyetelnya "terbuka" lagi sehingga
 * tombolnya tampak tidak berfungsi.
 */
export function balikGrup(id: string, pilihan: Record<string, boolean>): Record<string, boolean> {
  return { ...pilihan, [id]: !grupTerbuka(id, pilihan) };
}

const ADMIN_NAV_GROUP: NavGroup = {
  id: 'admin',
  label: 'Admin',
  items: [
    { id: 'admin', name: 'Admin Panel', subtitle: 'User & subscription', path: '/admin', icon: ShieldAlert },
    { id: 'admin-jobs', name: 'Cron & Update Mingguan', subtitle: 'Jadwal, hasil audit & kesehatan job', path: '/admin/jobs', icon: Activity },
    { id: 'admin-decision-lab', name: 'Simulasi Keputusan AI', subtitle: 'Paper order & bukti sinyal', path: '/admin/decision-lab', icon: Brain },
    { id: 'admin-calibration', name: 'Uji Akurasi LensRadar', subtitle: 'Skor, T+20 & OOS', path: '/admin/calibration', icon: BookOpenCheck },
    { id: 'admin-transparency', name: 'Bukti Validasi LensRadar', subtitle: 'Kelompok skor & cek harga', path: '/admin/transparency', icon: ShieldCheck },
    { id: 'admin-fundamental-backfill', name: 'Impor Histori Fundamental', subtitle: 'Upload CSV resmi', path: '/admin/fundamental-backfill', icon: FileSpreadsheet },
    { id: 'admin-financial-integrity', name: 'Pemeriksaan Data Keuangan', subtitle: 'Gerbang adopsi data', path: '/admin/financial-integrity', icon: ShieldCheck },
    { id: 'admin-market-data-integrity', name: 'Pemeriksaan Harga Penutupan', subtitle: 'Cek IDX vs pembanding', path: '/admin/data-integrity', icon: ShieldCheck },
    { id: 'admin-macro-pit', name: 'Bukti Data Makro', subtitle: 'SBN, ERP, BI-Rate', path: '/admin/macro-assumptions', icon: Waves },
    { id: 'admin-bank-fundamentals', name: 'Bukti Fundamental Bank', subtitle: 'NIM, NPL, CASA, CAR', path: '/admin/bank-fundamentals', icon: Building2 },
    { id: 'admin-ownership-flow', name: 'Arus Kepemilikan', subtitle: 'Status data kepemilikan', path: '/admin/ownership-flow', icon: Users },
    { id: 'admin-lensai-feedback', name: 'Masukan LensAI', subtitle: 'Audit jawaban pengguna', path: '/admin/lensai-feedback', icon: MessageSquare },
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

export function isPathActive(pathname: string, item: NavItem) {
  // Item beraksi tidak punya rute, jadi tidak pernah "sedang dibuka". Ini bukan detail
  // kosmetik: `item.path` mereka string kosong, dan `pathname.startsWith('/')` bernilai
  // benar untuk SETIAP halaman - tanpa penjaga ini LensAI akan tampak aktif di seluruh
  // aplikasi sekaligus, dan grupnya ikut terbuka paksa di setiap navigasi.
  if (item.action) return false;
  if (item.path === '/') return pathname === '/';
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { loading: authLoading, user, resolved: authResolved, effectiveRole } = useAuthUser();
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [hoveredNav, setHoveredNav] = useState<{ label: string; top: number; locked: boolean } | null>(null);
  // Kosong = pengguna BELUM memilih apa pun untuk grup itu. Dibedakan dari `false`
  // (sengaja ditutup) supaya pilihan pengguna bisa menang atas pembukaan otomatis di
  // bawah. Sebelumnya seluruh kunci diisi di awal, sehingga "belum memilih" dan
  // "memilih tertutup" tidak bisa dibedakan sama sekali.
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const closeProfileModal = useCallback(() => setShowProfileModal(false), []);

  useEffect(() => {
    apiRequest<any>('/api/admin-status')
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
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
      if (stored === 'true') setIsCollapsed(true);
    }, 0);
    return () => window.clearTimeout(timer);
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

  useEffect(() => {
    const activeGroup = visibleGroups.find((group) => group.items.some((item) => isPathActive(pathname, item)));
    if (!activeGroup) return;
    // Buka otomatis HANYA kalau pengguna belum pernah menyentuh grup ini. Versi lama
    // membuka paksa setiap kali pathname berubah, jadi grup yang baru saja ditutup
    // menganga lagi begitu pengguna pindah halaman di dalamnya - tombolnya terasa rusak.
    const timer = window.setTimeout(() => {
      setExpandedGroups((current) => (activeGroup.id in current ? current : { ...current, [activeGroup.id]: true }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname, visibleGroups]);

  const toggleGroup = useCallback((groupId: string) => {
    // Dibalik dari keadaan EFEKTIF, bukan dari `current[groupId]` yang bisa `undefined`.
    // Untuk grup yang default-nya terbuka, `!undefined` bernilai true - artinya klik
    // pertama menyetelnya "terbuka" lagi dan tidak terjadi apa-apa di layar.
    setExpandedGroups((current) => balikGrup(groupId, current));
  }, []);

  const getLocalizedGroupName = useCallback((id: string, defaultLabel: string) => {
    switch (id) {
      case 'overview': return t('nav.groupMain');
      case 'research': return t('nav.groupResearch');
      case 'tools': return t('nav.groupTools');
      case 'intelligence': return t('nav.groupIntelligence');
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
    await apiRequest('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <>
      {isOpen && (
        <Button variant="bare" size="none"
          type="button"
          aria-label={t('common.close')}
          className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh flex-col border-r border-tv-border bg-tv-bg/95 backdrop-blur-xl transition-all duration-300 md:relative md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isCollapsed ? 'w-[min(22rem,calc(100vw-1rem))] md:w-[76px]' : 'w-[min(22rem,calc(100vw-1rem))] md:w-[292px]'}`}
      >
        <div className={`flex h-[72px] items-center border-b border-tv-border ${isCollapsed ? 'md:justify-center md:px-2' : 'justify-between px-4'}`}>
          <Link href="/" className="group flex min-w-0 items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-inner p-1">
              <Image src="/sahamlens-logo.png" alt="SahamLens" fill sizes="40px" className="object-contain" />
            </div>
            <div className={isCollapsed ? 'md:hidden' : ''}>
              <div className="flex items-center gap-2">
                <span className="lens-label font-bold tracking-tight text-tv-text">SahamLens</span>
                <span className="rounded-full border border-tv-blue/20 bg-tv-blue/10 px-1.5 py-0.5 lens-chip font-bold uppercase tracking-[0.16em] text-tv-blue">Beta</span>
              </div>
              <p className="lens-meta mt-0.5 text-tv-muted">Intelligence for IDX investors</p>
            </div>
          </Link>
          <Button variant="bare" size="none"
            type="button"
            onClick={toggleCollapse}
            className={`hidden h-8 w-8 items-center justify-center rounded-xl text-tv-muted transition-colors hover:bg-white/[0.06] hover:text-white md:flex ${isCollapsed ? 'absolute left-[22px] top-[80px]' : ''}`}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        <div className={`flex-1 overflow-y-auto overflow-x-visible py-4 ${isCollapsed ? 'md:px-2 px-3' : 'px-3'}`}>
          <div className="space-y-5">
            {visibleGroups.map((group) => {
              // `groupHasActiveItem` sengaja TIDAK lagi ikut memaksa terbuka. Dulu ia
              // di-OR ke sini, sehingga grup yang memuat halaman yang sedang dibuka tidak
              // pernah bisa ditutup - persis grup yang paling sering ingin ditutup orang
              // setelah selesai memakainya. Pembukaan otomatis tetap ada, tapi tempatnya
              // di useEffect di atas sebagai NILAI AWAL, bukan sebagai penimpa.
              const groupOpen = grupTerbuka(group.id, expandedGroups);
              return (
              <section key={group.id}>
                <Button
                  variant="bare"
                  size="none"
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={groupOpen}
                  className={`mb-1.5 flex w-full items-center justify-between rounded-lg px-2.5 py-1 text-left lens-eyebrow text-tv-muted/70 transition hover:bg-white/[0.035] hover:text-tv-muted ${isCollapsed ? 'md:hidden' : ''}`}
                >
                  <span>{getLocalizedGroupName(group.id, group.label)}</span>
                  <ChevronRight className={`h-3.5 w-3.5 transition-transform ${groupOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
                </Button>
                {isCollapsed && <div className="mx-2 mb-2 hidden border-t border-tv-border md:block" />}
                <div className={`space-y-0.5 ${kelasIsiGrup(groupOpen, isCollapsed)}`}>
                  {group.items.map((item) => {
                    const localized = getLocalizedItem(item.id, item.name, item.subtitle);
                    const active = isPathActive(pathname, item);
                    const lockedForGuest = !authLoading && authResolved && !user && role === 'guest' && isProtectedPage(item.path);
                    const href = lockedForGuest
                      ? `/login-required?next=${encodeURIComponent(item.path)}&feature=${encodeURIComponent(localized.name)}`
                      : item.path;
                    const Icon = item.icon;
                    const accentClass = item.accent ? ACCENT_CLASS[item.accent] : 'text-white/45 bg-white/[0.03]';
                    // Item beraksi (mis. LensAI) memakai markup yang SAMA persis dengan item
                    // bertautan. Yang berbeda hanya elemen terluarnya: tombol untuk yang
                    // membuka panel, tautan untuk yang memang punya URL. Dipisah begini supaya
                    // gaya keduanya tidak bisa menyimpang diam-diam.
                    const sharedProps = {
                      title: lockedForGuest ? `${localized.name} - ${t('nav.loginRequired')}` : localized.name,
                      'aria-label': lockedForGuest ? `${localized.name}, ${t('nav.loginRequired')}` : localized.name,
                      onMouseLeave: () => setHoveredNav(null),
                      onBlur: () => setHoveredNav(null),
                      className: `group relative flex w-full min-h-14 items-center rounded-xl text-left md:min-h-[46px] transition-all duration-200 ${
                        isCollapsed ? 'md:justify-center md:px-0 px-2.5' : 'px-2.5'
                      } ${active ? 'bg-white/[0.075] text-white' : 'text-white/70 hover:bg-white/[0.045] hover:text-white'} ${
                        lockedForGuest ? 'cursor-pointer' : ''
                      }`,
                    };
                    const hoverProps = {
                      onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
                        if (!isCollapsed) return;
                        const rect = event.currentTarget.getBoundingClientRect();
                        setHoveredNav({ label: localized.name, top: rect.top + rect.height / 2, locked: lockedForGuest });
                      },
                      onFocus: (event: React.FocusEvent<HTMLElement>) => {
                        if (!isCollapsed) return;
                        const rect = event.currentTarget.getBoundingClientRect();
                        setHoveredNav({ label: localized.name, top: rect.top + rect.height / 2, locked: lockedForGuest });
                      },
                    };
                    const isi = (
                      <>
                        {active && (
                          <motion.span
                            layoutId="sidebar-active"
                            className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-tv-blue"
                            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
                          />
                        )}
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl md:h-8 md:w-8 transition-all ${active ? 'bg-tv-blue/[0.12] text-tv-blue' : accentClass}`}>
                          <Icon className="h-[18px] w-[18px] md:h-[16px] md:w-[16px]" />
                        </span>
                        <span className={`ml-2.5 min-w-0 flex-1 ${isCollapsed ? 'md:hidden' : ''}`}>
                          <span className="flex items-center gap-1.5">
                            <span className="lens-label truncate text-tv-text">{localized.name}</span>
                            {item.live && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-tv-green" />}
                          </span>
                          <span className="lens-meta mt-0.5 block whitespace-normal break-words text-tv-muted md:truncate">{localized.subtitle}</span>
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
                      </>
                    );

                    if (item.action) {
                      const eventName = item.action;
                      return (
                        <Button
                          key={item.id}
                          variant="bare"
                          size="none"
                          type="button"
                          {...sharedProps}
                          {...hoverProps}
                          onClick={() => {
                            setIsOpen(false);
                            window.dispatchEvent(new Event(eventName));
                          }}
                        >
                          {isi}
                        </Button>
                      );
                    }

                    return (
                      <Link
                        key={item.id}
                        href={href}
                        {...sharedProps}
                        {...hoverProps}
                        onClick={() => setIsOpen(false)}
                      >
                        {isi}
                      </Link>
                    );
                  })}
                </div>
              </section>
              );
            })}
          </div>
        </div>
        {isCollapsed && hoveredNav && (
          <Card
            as="div"
            padding="none"
            radius="xl"
            elevation="sm"
            className="pointer-events-none fixed left-[86px] z-[100] hidden -translate-y-1/2 items-center px-3 py-2 lens-label text-tv-text md:flex"
            style={{ top: hoveredNav.top }}
          >
            <span className="absolute -left-1.5 h-3 w-3 rotate-45 border-b border-l border-tv-border bg-tv-card" aria-hidden="true" />
            <span className="relative">
              {hoveredNav.label}{hoveredNav.locked ? ` · ${t('nav.loginRequired')}` : ''}
            </span>
          </Card>
        )}

        <div className="border-t border-tv-border p-3">
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
              <span className={`rounded bg-tv-blue/20 px-1.5 py-0.5 lens-meta uppercase tracking-wider ${isCollapsed ? 'md:hidden' : ''}`}>Admin</span>
            </Link>
          )}
          {!authLoading && user ? (
            <div className={`rounded-2xl border border-tv-border bg-white/[0.025] p-2 ${isCollapsed ? 'md:border-transparent md:bg-transparent md:p-0' : ''}`}>
              <div className={`flex items-center gap-2 ${isCollapsed ? 'md:justify-center' : ''}`}>
                <Button variant="bare" size="none"
                  type="button"
                  onClick={() => setShowProfileModal(true)}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl p-1.5 text-left transition-colors hover:bg-white/[0.04] ${isCollapsed ? 'md:flex-none md:p-1' : ''}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl md:h-8 md:w-8 bg-tv-blue/10 text-tv-blue">
                    <User className="h-4 w-4" />
                  </span>
                  <span className={`min-w-0 flex-1 ${isCollapsed ? 'md:hidden' : ''}`}>
                    <span className="block truncate text-sm font-semibold text-white md:text-xs">{user.email?.split('@')[0]}</span>
                    <span className="lens-chip mt-0.5 block font-bold uppercase tracking-wider text-tv-muted">{user.role}</span>
                  </span>
                </Button>
                <Button variant="bare" size="none"
                  type="button"
                  onClick={handleLogout}
                  title={t('nav.logout')}
                  aria-label={t('nav.logout')}
                  className={`rounded-xl p-2 text-tv-muted transition-colors hover:bg-tv-red/10 hover:text-tv-red ${isCollapsed ? 'md:hidden' : ''}`}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : !authLoading ? (
            <Link href="/login" className={`flex items-center gap-2 rounded-2xl border border-tv-blue/15 bg-tv-blue/10 p-2.5 font-semibold text-tv-blue transition-colors hover:bg-tv-blue/15 ${isCollapsed ? 'md:justify-center md:px-0' : ''}`}>
              <LogIn className="h-4 w-4 shrink-0" />
              <span className={`text-sm ${isCollapsed ? 'md:hidden' : ''}`}>{t('nav.login')}</span>
            </Link>
          ) : null}

          <div className={`mt-2.5 flex items-center justify-between px-1 lens-meta text-tv-muted/60 ${isCollapsed ? 'md:hidden' : ''}`}>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-tv-green" /> {t('nav.idxConnected')}</span>
            <span>{t('nav.v2Ui')}</span>
          </div>
        </div>
      </aside>
      <UserProfileModal open={showProfileModal} onClose={closeProfileModal} />
    </>
  );
}
