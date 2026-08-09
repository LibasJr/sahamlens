import './globals.css';
import { Inter, JetBrains_Mono } from 'next/font/google';
import React from 'react';
import AppShell from '@/components/AppShell';

// Design System "Lens" (2026-08-06): dua font saja, bukan empat.
// Inter untuk semua teks & heading, JetBrains Mono untuk semua angka/harga.
// Sebelumnya di sini dimuat Plus Jakarta Sans + Sora + Space Grotesk + JetBrains
// Mono sekaligus - empat unduhan font padahal Sora dan Space Grotesk cuma dipakai
// lewat aturan CSS di globals.css yang menyebut nama keluarga font secara literal
// ('Sora', 'Space Grotesk'), bukan lewat variabel next/font, jadi variabelnya
// tidak pernah benar-benar terpakai.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-jetbrains-mono' });

// Audit BUILD 002 (SEO) - sebelumnya cuma title+description di root layout, tanpa
// metadataBase/OpenGraph/robots/canonical, dan tanpa tagline resmi ("Lihat Peluang
// Lebih Jelas.") di mana pun. metadataBase WAJIB diisi supaya path relatif di
// openGraph.images/robots di bawah di-resolve ke domain absolut, bukan localhost.
const SITE_URL = 'https://sahamlens.id';
const GOOGLE_SITE_VERIFICATION = process.env.GOOGLE_SITE_VERIFICATION?.trim();

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'SahamLens - Screener & Analisis Saham IDX Berbasis AI',
    template: '%s | SahamLens',
  },
  description: 'Pantau skor teknikal, fundamental, dan arus dana saham likuid IDX. Gunakan screener, LensRadar, backtest, dan LensAI untuk membantu riset saham Indonesia.',
  applicationName: 'SahamLens',
  manifest: '/manifest.json',
  alternates: { canonical: '/' },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  verification: GOOGLE_SITE_VERIFICATION
    ? { google: GOOGLE_SITE_VERIFICATION }
    : undefined,
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    url: SITE_URL,
    siteName: 'SahamLens',
    title: 'SahamLens - Screener & Analisis Saham IDX Berbasis AI',
    description: 'Pantau skor teknikal, fundamental, dan arus dana saham likuid IDX untuk membantu riset saham Indonesia.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'SahamLens' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SahamLens - Screener & Analisis Saham IDX Berbasis AI',
    description: 'Pantau skor teknikal, fundamental, dan arus dana saham likuid IDX untuk membantu riset saham Indonesia.',
    images: ['/og-image.png'],
  },
};

// Dark mode PERMANEN di seluruh app - sengaja tidak ada toggle. Nyaris semua halaman
// setelah login (Sidebar, Market Pulse, Fundamental, dll.) hardcode warna gelap tanpa
// versi terang sama sekali, jadi kalau class 'dark' pernah dilepas dari <html>,
// background <body> (yang punya varian dark:) jadi terang dan "bocor" di celah-celah
// yang tidak tertutup card gelap. Satu tema, konsisten di semua halaman, tanpa celah.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className={`${inter.className} bg-tv-bg text-tv-text antialiased min-h-screen relative overflow-x-hidden selection:bg-tv-blue/25`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
