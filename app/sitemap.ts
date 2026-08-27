import type { MetadataRoute } from 'next';
import { loadEmitenList } from '@/shared/market/emiten-list';

const SITE_URL = 'https://sahamlens.id';

// Hanya URL publik/indexable. Jangan masukkan halaman yang redirect ke /login,
// karena sitemap harus membantu crawler menemukan konten yang benar-benar bisa
// diakses tanpa sesi pengguna.
const PUBLIC_ROUTES = [
  { path: '', priority: 1.0, changeFrequency: 'daily' as const },
  { path: 'breakout-radar', priority: 0.8, changeFrequency: 'daily' as const },
  { path: 'screener', priority: 0.8, changeFrequency: 'daily' as const },
  { path: 'market-pulse', priority: 0.8, changeFrequency: 'daily' as const },
  { path: 'news', priority: 0.8, changeFrequency: 'hourly' as const },
  { path: 'calendar', priority: 0.7, changeFrequency: 'daily' as const },
  { path: 'about', priority: 0.6, changeFrequency: 'monthly' as const },
  { path: 'transparency', priority: 0.6, changeFrequency: 'daily' as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const publicPages = PUBLIC_ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: path ? `${SITE_URL}/${path}` : SITE_URL,
    lastModified,
    changeFrequency,
    priority,
  }));

  // Halaman technical per-emiten adalah landing page publik bernilai long-tail SEO.
  // Daftar diambil dari universe emiten server yang sama dengan ticker validation, bukan
  // hard-code beberapa saham populer. Jumlahnya masih jauh di bawah batas 50.000 URL/sitemap.
  const technicalPages: MetadataRoute.Sitemap = loadEmitenList().map(({ symbol }) => ({
    url: `${SITE_URL}/technical/${symbol}`,
    lastModified,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  return [...publicPages, ...technicalPages];
}
