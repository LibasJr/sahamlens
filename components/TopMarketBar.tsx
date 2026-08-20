'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clock3, User as UserIcon } from 'lucide-react';
import { getMarketStatus } from '@/lib/utils/market';
import { useAuthUser } from '@/lib/hooks/useAuthUser';
import TrialCountdown from './TrialCountdown';
import ThemeToggle from './ThemeToggle';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import NotificationCenter from '@/components/ui/NotificationCenter';
import { useLanguage } from '@/lib/i18n';
import { Button as PrimitiveButton } from '@/components/ui/Button';
import { sharedMarketRequest } from '@/shared/http/shared-market-request';
import MarketTicker from './MarketTicker';

const CommandPalette = dynamic(() => import('./CommandPalette'), { ssr: false, loading: () => <div className="h-10 w-full animate-pulse rounded-xl bg-white/[0.035]" /> });

const MODULE_SEARCH_ROUTES = ['/dashboard', '/fundamental', '/macro', '/screener'];

export default function TopMarketBar() {
  const pathname = usePathname();
  const [ihsg, setIhsg] = useState<{ price: number; change: number } | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const { loading: authLoading, user, effectiveRole, trialDaysLeft } = useAuthUser();

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => {
      if (!document.hidden) setNow(new Date());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Dipakai bersama HomeWorkspace lewat shared-market-request: sebelum ini beranda
    // mengirim /api/live/^JKSE dua kali - sekali dari sini, sekali dari hero.
    sharedMarketRequest<any>('/api/live/^JKSE')
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

  const { t, language } = useLanguage();
  const marketStatus = now ? getMarketStatus(now) : { isOpen: false, label: 'Bursa tutup', holidayName: null };
  const marketStatusLabel = marketStatus.isOpen
    ? t('common.marketOpen')
    : marketStatus.holidayName
      ? marketStatus.holidayName
      : t('common.marketClosed');
  const hasModuleSearch = MODULE_SEARCH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`)) || pathname.startsWith('/technical/');
  const jakartaTime = now
    ? `${new Intl.DateTimeFormat(language === 'id' ? 'id-ID' : 'en-US', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)} ${t('common.wibTime')}`
    : '--:--';

  return (
    <>
    <header className="relative z-30 flex h-16 shrink-0 items-center gap-3 border-b border-tv-border bg-tv-bg/90 px-3 backdrop-blur-xl md:px-5">
      <Link
        href="/"
        title="SahamLens Beranda"
        aria-label="Kembali ke Beranda SahamLens"
        className="flex items-center gap-2 shrink-0 md:hidden transition-transform active:scale-95"
      >
        <Image
          src="/sahamlens-logo.png"
          alt="SahamLens"
          width={32}
          height={32}
          className="h-8 w-8 rounded-xl object-contain border border-tv-border"
        />
      </Link>

      <div className="flex min-w-0 items-center gap-2 min-h-11 md:min-h-0">
        <span className="lens-eyebrow text-tv-muted">IHSG</span>
        {ihsg ? (
          <>
            <span className="hidden font-number lens-label text-tv-text sm:inline">{ihsg.price.toLocaleString(language === 'id' ? 'id-ID' : 'en-US')}</span>
            <span className={`font-number lens-label ${ihsg.change >= 0 ? 'text-tv-green' : 'text-tv-red'}`}>
              {ihsg.change >= 0 ? '+' : ''}{ihsg.change.toFixed(2)}%
            </span>
          </>
        ) : (
          <span className="font-number lens-label text-tv-muted">--</span>
        )}
      </div>

      {!hasModuleSearch && (
        <div className="hidden min-w-0 max-w-[520px] flex-1 lg:block">
          <CommandPalette />
        </div>
      )}
      {hasModuleSearch && <div className="hidden flex-1 lg:block" />}

      <div className="ml-auto flex items-center gap-1.5">
        <div className={`hidden items-center gap-1.5 px-2 lens-meta md:flex ${marketStatus.isOpen ? 'text-tv-green' : marketStatus.holidayName ? 'text-tv-gold' : 'text-tv-muted'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${marketStatus.isOpen ? 'bg-tv-green' : marketStatus.holidayName ? 'bg-tv-gold' : 'bg-tv-muted/50'}`} />
          {marketStatusLabel}
        </div>

        <div className="hidden items-center gap-1.5 px-2 lens-meta text-tv-muted xl:flex">
          <Clock3 className="h-3.5 w-3.5" /> {jakartaTime}
        </div>

        <LanguageSwitcher variant="pill" className="hidden sm:inline-flex" />
        <LanguageSwitcher variant="compact" className="sm:hidden" />
        <ThemeToggle />

        <TrialCountdown daysLeft={trialDaysLeft} />

        <NotificationCenter />

        {authLoading ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-xl text-tv-muted/40"><UserIcon className="h-4 w-4" /></span>
        ) : user ? (
          <PrimitiveButton variant="bare" size="none"
            type="button"
            onClick={() => window.dispatchEvent(new Event('open-profile-modal'))}
            title="Profil"
            aria-label="Profil"
            className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.025] px-2 text-tv-muted transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-tv-blue/10 text-tv-blue">
              <UserIcon className="h-3.5 w-3.5" />
            </span>
            <span className="hidden max-w-[90px] truncate lens-meta text-tv-text/80 2xl:block">{user.email?.split('@')[0]}</span>
          </PrimitiveButton>
        ) : (
          <Link href="/login" className="inline-flex min-h-11 items-center rounded-xl bg-tv-blue px-3 py-2 lens-label text-white transition hover:bg-tv-blueHover">
            Masuk
          </Link>
        )}
      </div>
    </header>
    <MarketTicker />
    </>
  );
}
