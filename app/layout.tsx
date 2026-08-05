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
const SITE_URL = 'https://sahamlens.vercel.app';
const TAGLINE = 'Lihat Peluang Lebih Jelas.';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `SahamLens - ${TAGLINE}`,
    template: '%s | SahamLens',
  },
  description: `SahamLens - ${TAGLINE} Screener & analisis saham IDX berbasis data riil (Yahoo Finance) dan AI - teknikal, fundamental, backtest, dan rekomendasi dalam satu aplikasi. Bukan saran finansial, untuk edukasi.`,
  manifest: '/manifest.json',
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    url: SITE_URL,
    siteName: 'SahamLens',
    title: `SahamLens - ${TAGLINE}`,
    description: `Screener & analisis saham IDX berbasis data riil dan AI - teknikal, fundamental, backtest, dan rekomendasi dalam satu aplikasi.`,
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'SahamLens' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `SahamLens - ${TAGLINE}`,
    description: `Screener & analisis saham IDX berbasis data riil dan AI.`,
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
