import type { MetadataRoute } from 'next';

const SITE_URL = 'https://sahamlens.id';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Endpoint/API dan panel admin bukan konten hasil pencarian.
      disallow: ['/api/', '/admin', '/admin-login'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
