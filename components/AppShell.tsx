'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import AIChat from '@/components/AIChat';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLandingPage = pathname === '/';

  if (isLandingPage) {
    return (
      <>
        {children}
        <AIChat />
      </>
    );
  }

  React.useEffect(() => {
    // Clean up event listeners if any
  }, []);

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {children}
      </main>
      <AIChat />
    </div>
  );
}
