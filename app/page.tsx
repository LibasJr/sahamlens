import HomeWorkspace from '@/components/HomeWorkspace';

const WEBSITE_STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'SahamLens',
  alternateName: 'SahamLens.id',
  url: 'https://sahamlens.id',
  inLanguage: 'id-ID',
  description: 'Screener dan analisis kuantitatif saham IDX dari rumus terbuka, dengan penjelasan AI, untuk membantu riset saham Indonesia.',
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(WEBSITE_STRUCTURED_DATA).replace(/</g, '\\u003c'),
        }}
      />
      <HomeWorkspace />
    </>
  );
}
