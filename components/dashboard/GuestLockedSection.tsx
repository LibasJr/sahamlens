'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { trackSignupClick } from '@/shared/analytics/product-funnel';

export function GuestLockedSection({ children, label }: { children?: React.ReactNode; label: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="pointer-events-none select-none blur-sm opacity-45" aria-hidden="true">
        {children}
      </div>
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-tv-bg/75 p-4 text-center backdrop-blur-[3px]">
        <Lock className="h-5 w-5 text-tv-yellow" aria-hidden="true" />
        <div className="text-sm font-bold text-tv-text">{label} terkunci</div>
        <Link
          href="/signup?next=%2Fdashboard"
          onClick={() => trackSignupClick('technical_locked_section')}
          className="rounded-full border border-tv-yellow/40 bg-tv-yellow/10 px-3 py-1.5 text-xs font-bold text-tv-yellow transition-colors hover:border-tv-yellow hover:text-white"
        >
          Daftar Gratis
        </Link>
      </div>
    </div>
  );
}
