import Link from 'next/link';
import React from 'react';
import { cn } from '../../lib/utils/cn';

/**
 * Navigasi antar BAGIAN riset.
 *
 * Batas terhadap `SegmentedControl` sengaja dinyatakan, karena keduanya tampak mirip dan
 * akan tertukar:
 *   - ResearchTabs berpindah antar bagian konten (Technical / Fundamental / Flow / Valuation).
 *   - SegmentedControl mengubah cara data yang SAMA ditampilkan (mis. periode chart).
 *
 * Presentasi murni: `activeId` datang dari pemanggil, bukan dari `usePathname()` di dalam
 * sini. Itu yang membuatnya bisa dirender dan diuji tanpa router - dan membuat aturan
 * "tab aktif tidak pernah memindahkan pengguna" jadi milik pemanggil yang memang tahu
 * rutenya.
 */
export interface ResearchTab {
  id: string;
  label: string;
  href: string;
}

export function ResearchTabs({
  tabs,
  activeId,
  label,
  className,
}: {
  tabs: ResearchTab[];
  activeId: string | null;
  label: string;
  className?: string;
}) {
  if (tabs.length === 0) return null;

  return (
    <nav aria-label={label} className={cn('-mx-1 flex items-center gap-1 overflow-x-auto px-1', className)}>
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            // 44px di SEMUA lebar, tanpa varian yang mengecilkannya di md+.
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 lens-label transition-colors',
              active
                ? 'bg-tv-blue/10 text-tv-blue'
                : 'text-tv-muted hover:bg-white/[0.05] hover:text-tv-text',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
