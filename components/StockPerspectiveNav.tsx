'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Navigasi lintas halaman emiten sengaja dibuat ringkas.
 *
 * Flow dan Summary adalah bagian dari alur vertikal LensTechnical dan lebih natural
 * ditemukan dengan scroll. Valuation tetap tersedia lewat entry point produknya sendiri,
 * tetapi tidak lagi memenuhi bar konteks di bagian atas analisis saham.
 */
export const TECHNICAL_SUMMARY_ANCHOR_ID = 'analysis-detail';
export const OPEN_TECHNICAL_SUMMARY_EVENT = 'sahamlens:open-technical-summary';

type Perspective = {
  id: string;
  label: string;
  href: (code: string, pathname: string) => string;
  activePaths?: string[];
};

const DASHBOARD_PATH = '/dashboard';

const PERSPECTIVES: Perspective[] = [
  {
    id: 'technical',
    label: 'Technical',
    href: (code, pathname) => (
      isUnder(pathname, DASHBOARD_PATH)
        ? `${DASHBOARD_PATH}?symbol=${code}.JK`
        : `/technical/${code}.JK`
    ),
    activePaths: ['/technical', DASHBOARD_PATH],
  },
  {
    id: 'fundamental',
    label: 'Fundamental',
    href: (code) => `/fundamental?symbol=${code}.JK`,
    activePaths: ['/fundamental'],
  },
];

function isUnder(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export type PerspectiveTab = {
  id: string;
  label: string;
  href: string;
  active: boolean;
};

export function perspectiveTabsFor(
  symbol: string | null | undefined,
  pathname: string,
): PerspectiveTab[] {
  const code = stockCodeFor(symbol);
  if (!code) return [];
  return PERSPECTIVES.map((perspective) => ({
    id: perspective.id,
    label: perspective.label,
    href: perspective.href(code, pathname),
    active: Boolean(perspective.activePaths?.some((route) => isUnder(pathname, route))),
  }));
}

const NAMA_INDEKS = new Set(['IHSG', 'LQ45', 'JKSE']);

export function stockCodeFor(symbol: string | null | undefined): string | null {
  if (!symbol) return null;
  const raw = symbol.trim().toUpperCase().replace(/\.JK$/i, '');
  if (!/^[A-Z]{4}$/.test(raw)) return null;
  if (NAMA_INDEKS.has(raw)) return null;
  return raw;
}

export default function StockPerspectiveNav({ symbol }: { symbol: string | null | undefined }) {
  const pathname = usePathname();
  const code = stockCodeFor(symbol);
  const tabs = perspectiveTabsFor(symbol, pathname ?? '');
  if (!code || tabs.length === 0) return null;

  return (
    <nav
      aria-label={`Sudut pandang analisis ${code}`}
      className="lens-stock-nav -mx-1 flex items-center gap-1 overflow-x-auto px-1"
    >
      {tabs.map(({ id, label, href, active }) => (
        <Link
          key={id}
          href={href}
          aria-current={active ? 'page' : undefined}
          className={`inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 lens-label transition-colors ${
            active
              ? 'bg-tv-blue/10 text-tv-blue'
              : 'text-tv-muted hover:bg-white/[0.05] hover:text-tv-text'
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
