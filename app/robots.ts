import type { MetadataRoute } from 'next';

const SITE_URL = 'https://sahamlens.id';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Endpoint/API, panel admin, dan workbench internal bukan konten hasil pencarian.
      disallow: ['/api/', '/admin', '/admin-login', '/_workbench'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
