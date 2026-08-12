'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import TopMarketBar from '@/components/TopMarketBar';
import MobileNav from '@/components/MobileNav';
import TrialExpiredGate from '@/components/TrialExpiredGate';
import SmartBackNavigation from '@/components/SmartBackNavigation';
import ThemeToggle from '@/components/ThemeToggle';
import PageTransition from '@/components/PageTransition';
import EnergySaver from '@/components/EnergySaver';
import SiteFooter from '@/components/SiteFooter';

const AIChat = dynamic(() => import('@/components/AIChat'), { ssr: false, loading: () => null });

const BARE_AUTH_PAGES = ['/login', '/signup', '/forgot-password', '/reset-password', '/admin-login', '/admin'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLandingPage = pathname === '/';
  const isBareAuthPage = BARE_AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isLandingPage) {
    return (
      <>
        <EnergySaver />
        <PageTransition>{children}</PageTransition>
        <AIChat />
      </>
    );
  }

  if (isBareAuthPage) return <><EnergySaver /><ThemeToggle /><PageTransition>{children}</PageTransition></>;

  return (
    <div className="lens-app-shell flex min-h-screen w-full bg-tv-bg text-tv-text">
      <EnergySaver />
      <Sidebar />
      <div className="lens-shell-viewport relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopMarketBar />
        <main className="lens-main relative flex min-w-0 flex-1 flex-col overflow-y-auto">
          <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 lens-ambient-bg" />
          <div className="relative z-[1] min-h-full">
            <PageTransition>{children}</PageTransition>
            {/* Sebelum ini, SELURUH halaman ber-shell tidak punya penutup sama sekali -
                termasuk jalan menuju /about. Ditaruh sebelum ruang bebas MobileNav supaya
                di HP tidak tertutup bilah navigasi bawah. */}
            <div className="px-4 pb-2 sm:px-6">
              <SiteFooter />
            </div>
            <div aria-hidden="true" className="lens-mobile-scroll-clearance pointer-events-none md:hidden" />
          </div>
        </main>
      </div>
      <SmartBackNavigation />
      <MobileNav />
      <AIChat />
      <TrialExpiredGate />
    </div>
  );
}
