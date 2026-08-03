import type { MetadataRoute } from 'next';

// Audit BUILD 002 (SEO) - sebelumnya tidak ada robots.txt sama sekali. /api/* dan
// halaman auth (/login, /signup, dst) dikecualikan dari crawl - bukan konten yang
// perlu diindeks, dan /api/* butuh auth/rate-limit jadi percuma di-crawl.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin', '/admin-login', '/login', '/signup', '/forgot-password', '/reset-password'],
    },
    sitemap: 'https://sahamlens.vercel.app/sitemap.xml',
  };
}
