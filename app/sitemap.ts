import type { MetadataRoute } from 'next';

// Audit BUILD 002 (SEO) - sebelumnya tidak ada sitemap sama sekali. Cuma halaman
// tool/analisis statis (public, tanpa login - lihat middleware.ts PROTECTED_PAGES)
// yang didaftarkan - halaman auth (/login, /signup, dst) dan rute dinamis tanpa
// index page sendiri (/technical/[symbol], /market/[category]) sengaja tidak
// dimasukkan, sama seperti pengecualian di app/robots.ts.
const SITE_URL = 'https://sahamlens.vercel.app';

const STATIC_ROUTES = [
  '', 'home', 'dashboard', 'screener', 'backtest', 'breakout-radar', 'recommendations',
  'compare', 'dcf', 'dividend', 'earnings', 'macro', 'market-pulse', 'moat', 'multi-agent',
  'news', 'pattern', 'risk', 'risk-calculator', 'watchlist', 'calendar', 'fundamental',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return STATIC_ROUTES.map((path) => ({
    url: `${SITE_URL}/${path}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: path === '' ? 1 : 0.7,
  }));
}
