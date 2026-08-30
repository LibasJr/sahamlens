import type { MetadataRoute } from 'next';

const SITE_URL = 'https://sahamlens.id';

// Endpoint/API, panel admin, dan workbench internal bukan konten hasil pencarian.
const DISALLOW = ['/api/', '/admin', '/admin-login', '/_workbench', '/multi-agent'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: DISALLOW,
      },
      {
        // Crawler indeks Meta menyapu SELURUH /technical/<emiten> dari sitemap secara
        // alfabetis dan tanpa jeda. Terukur 2026-08-24: 727 render halaman dalam 70
        // menit (03:41-04:50 WIB), yang memicu 688 panggilan internal ke /api/stock -
        // tiap satunya fetch Yahoo + hitung ulang indikator penuh, respons 20KB-780KB.
        // Beban itu jatuh dini hari saat tidak ada satu pun pengunjung nyata.
        //
        // Halaman /technical sengaja TIDAK di-disallow: itu landing page long-tail SEO
        // (lihat app/sitemap.ts). Yang dibatasi lajunya saja, dan khusus crawler ini -
        // Googlebot dkk. tidak tersentuh karena mengabaikan crawl-delay dan lajunya
        // memang sudah wajar.
        userAgent: ['meta-webindexer', 'meta-externalagent'],
        allow: '/',
        disallow: DISALLOW,
        crawlDelay: 10,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
