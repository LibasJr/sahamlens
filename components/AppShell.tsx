'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import AIChat from '@/components/AIChat';
import TopMarketBar from '@/components/TopMarketBar';
import MobileNav from '@/components/MobileNav';
import TrialExpiredGate from '@/components/TrialExpiredGate';

const BARE_AUTH_PAGES = ['/login', '/signup', '/forgot-password', '/reset-password', '/admin-login', '/admin'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLandingPage = pathname === '/';
  const isBareAuthPage = BARE_AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isLandingPage) {
    return (
      <>
        {children}
        <AIChat />
      </>
    );
  }

  if (isBareAuthPage) return <>{children}</>;

  return (
    <div className="lens-app-shell flex min-h-screen w-full bg-tv-bg text-tv-text">
      <Sidebar />
      <div className="relative flex min-w-0 flex-1 flex-col h-screen overflow-hidden">
        <TopMarketBar />
        <main className="lens-main relative flex min-w-0 flex-1 flex-col overflow-y-auto pb-20 md:pb-0">
          <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 lens-ambient-bg" />
          <div className="relative z-[1] min-h-full">{children}</div>
        </main>
      </div>
      <MobileNav />
      <AIChat />
      <TrialExpiredGate />
    </div>
  );
}
