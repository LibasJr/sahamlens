'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import AIChat from '@/components/AIChat';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLandingPage = pathname === '/';

  if (isLandingPage) {
    return <>{children}</>;
  }

  const containerRef = React.useRef<HTMLDivElement>(null);
  
  React.useEffect(() => {
    // Delay slightly to ensure layout is rendered before scrolling
    if (window.innerWidth < 640 && containerRef.current) {
      setTimeout(() => {
        if (containerRef.current) {
          containerRef.current.scrollLeft = window.innerWidth;
        }
      }, 50);
    }
  }, []);

  return (
    <div ref={containerRef} className="flex min-h-screen w-screen max-w-[100vw] overflow-x-auto overflow-y-hidden snap-x snap-mandatory sm:overflow-x-hidden scroll-smooth">
      <Sidebar />
      <main className="w-screen max-w-[100vw] sm:max-w-none sm:w-auto flex-1 shrink-0 snap-center flex flex-col min-w-0 h-screen overflow-y-auto">
        {children}
      </main>
      <AIChat />
    </div>
  );
}
