import { headers } from 'next/headers';
import HomeWorkspace from '@/components/HomeWorkspace';

// Canonical eksplisit. Root layout sengaja tidak lagi menetapkannya (lihat app/layout.tsx),
// jadi beranda menyatakan dirinya sendiri di sini.
export const metadata = {
  alternates: { canonical: '/' },
};

const WEBSITE_STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'SahamLens',
  alternateName: 'SahamLens.id',
  url: 'https://sahamlens.id',
  inLanguage: 'id-ID',
  description: 'Screener dan analisis kuantitatif saham IDX dari rumus terbuka, dengan penjelasan AI, untuk membantu riset saham Indonesia.',
};

export default async function HomePage() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <>
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(WEBSITE_STRUCTURED_DATA).replace(/</g, '\\u003c'),
        }}
      />
      <HomeWorkspace />
    </>
  );
}
