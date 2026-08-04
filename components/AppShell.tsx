'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import AIChat from '@/components/AIChat';
import TopMarketBar from '@/components/TopMarketBar';

const BARE_AUTH_PAGES = ['/login', '/signup', '/forgot-password', '/reset-password', '/admin-login', '/admin'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLandingPage = pathname === '/';
  const isBareAuthPage = BARE_AUTH_PAGES.some(p => pathname === p || pathname.startsWith(p + '/'));

  if (isLandingPage) {
    return (
      <>
        {children}
        <AIChat />
      </>
    );
  }

  // Auth pages render standalone: no sidebar, no menu, no chat widget.
  if (isBareAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <TopMarketBar />
        {children}
      </main>
      <AIChat />
    </div>
  );
}
