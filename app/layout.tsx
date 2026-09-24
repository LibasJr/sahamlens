import './globals.css';
import { headers } from 'next/headers';
import localFont from 'next/font/local';
import React from 'react';
import type { Viewport } from 'next';
import AppShell from '@/components/AppShell';

// Design System "Lens" (2026-08-06): dua font saja, bukan empat.
// Inter untuk semua teks & heading, JetBrains Mono untuk semua angka/harga.
//
// Riwayat penting - baca sebelum mengubah cara font dimuat:
//   (a) Awalnya empat keluarga (Plus Jakarta Sans + Sora + Space Grotesk + JetBrains
//       Mono), dan Sora/Space Grotesk dirujuk lewat nama literal di globals.css
//       sehingga variabel next/font-nya tidak pernah terpakai.
//   (b) 2026-09-23 (`2fef5146`) `next/font/google` DILEPAS karena build CI harus
//       mengambil berkas dari fonts.googleapis.com. Menggantinya dengan stack
//       sistem membuat nama token berbohong: `--font-inter` berisi Arial dan
//       `--font-jetbrains-mono` berisi Courier New - aplikasi tidak pernah
//       menyajikan Inter sama sekali.
//   (c) Sekarang: berkas font asli IKUT DI-COMMIT di `app/fonts/` dan dimuat lewat
//       `next/font/local`. Tidak ada permintaan jaringan saat build (persyaratan
//       (b)) DAN keluarga fontnya benar-benar Inter/JetBrains Mono (persyaratan (a)).
//       Berkasnya variable font, subset latin: Inter 100-900, JetBrains Mono 100-800.
//       Mengganti ini dengan `next/font/google` akan mengulang kegagalan (b).
const inter = localFont({
  src: [
    { path: './fonts/inter-latin-wght-normal.woff2', weight: '100 900', style: 'normal' },
    { path: './fonts/inter-latin-wght-italic.woff2', weight: '100 900', style: 'italic' },
  ],
  variable: '--font-inter-src',
  display: 'swap',
  fallback: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
});

const jetbrainsMono = localFont({
  src: [{ path: './fonts/jetbrains-mono-latin-wght-normal.woff2', weight: '100 800', style: 'normal' }],
  variable: '--font-jetbrains-mono-src',
  display: 'swap',
  fallback: ['Consolas', 'Menlo', 'Liberation Mono', 'monospace'],
});

// Audit BUILD 002 (SEO) - sebelumnya cuma title+description di root layout, tanpa
// metadataBase/OpenGraph/robots/canonical, dan tanpa tagline resmi ("Lihat Peluang
// Lebih Jelas.") di mana pun. metadataBase WAJIB diisi supaya path relatif di
// openGraph.images/robots di bawah di-resolve ke domain absolut, bukan localhost.
const SITE_URL = 'https://sahamlens.id';
const GOOGLE_SITE_VERIFICATION = process.env.GOOGLE_SITE_VERIFICATION?.trim();

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'SahamLens - Screener & Analisis Kuantitatif Saham IDX',
    template: '%s | SahamLens',
  },
  description: 'Skor teknikal, fundamental, dan arus dana saham likuid IDX dari rumus terbuka - bukan kotak hitam. Screener, LensRadar, backtest, dan penjelasan AI untuk membantu riset saham Indonesia.',
  applicationName: 'SahamLens',
  manifest: '/manifest.json?v=5',
  // TIDAK ADA `alternates.canonical` di sini - sengaja.
  //
  // Next mewariskan metadata root ke SETIAP halaman anak yang tidak menimpanya.
  // Sebelumnya baris ini berbunyi `alternates: { canonical: '/' }`, sehingga
  // /screener, /news, /calendar, /about, /fundamental, /dcf, /moat, dan /dividend
  // semuanya mengirim <link rel="canonical" href="https://sahamlens.id"> - yaitu
  // menyuruh Google mengabaikan halaman itu dan mengindeks beranda sebagai gantinya.
  // Sitemap mendaftarkan URL-nya, canonical membatalkannya; canonical yang menang.
  //
  // Canonical HARUS dideklarasikan per halaman. Halaman yang tidak bisa mengekspor
  // metadata (komponen 'use client') memakai layout.tsx tipis di folder rutenya.
  // Tanpa nilai di root, halaman yang belum punya canonical akan self-canonical -
  // salah yang jauh lebih ringan daripada menunjuk ke beranda.
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
    title: 'SahamLens - Screener & Analisis Kuantitatif Saham IDX',
    description: 'Pantau skor teknikal, fundamental, dan arus dana saham likuid IDX untuk membantu riset saham Indonesia.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'SahamLens' }],
  },
  icons: {
    icon: [
      { url: '/favicon.ico?v=5' },
      { url: '/icon-pwa-192.png?v=5', sizes: '192x192', type: 'image/png' },
      { url: '/icon-pwa-512.png?v=5', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-icon.png?v=5', sizes: '180x180', type: 'image/png' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SahamLens - Screener & Analisis Kuantitatif Saham IDX',
    description: 'Pantau skor teknikal, fundamental, dan arus dana saham likuid IDX untuk membantu riset saham Indonesia.',
    images: ['/og-image.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'dark light',
  // WAJIB agar env(safe-area-inset-*) punya nilai. Tanpa viewport-fit=cover, Safari
  // dan seluruh webview berbasis WKWebView mengembalikan 0 untuk keempat inset,
  // sehingga perhitungan di app/globals.css - `calc(0.375rem + env(safe-area-inset-bottom))`
  // pada .lens-mobile-nav dan .lens-ai-floating - runtuh diam-diam ke jarak tetapnya.
  // Akibatnya navigasi bawah duduk di belakang home indicator iPhone. Bug ini tidak
  // pernah terlihat di Android karena di sana inset-nya memang sering 0.
  viewportFit: 'cover',
  // Warna status bar di mode standalone/webview. Dua entri, bukan satu nilai tetap:
  // aplikasi punya tema terang, dan satu nilai gelap membuat pengguna tema terang
  // mendapat bilah status gelap di atas halaman putih. Nilainya sengaja sama persis
  // dengan --lens-bg di app/globals.css (7 11 18 dan 244 247 251) supaya tidak ada
  // sambungan warna di tepi atas layar.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F7FB' },
    { media: '(prefers-color-scheme: dark)', color: '#070B12' },
  ],
};

// Dijalankan SEBELUM paint pertama, sebelum React menghidrasi apa pun.
//
// Bagian bahasa ditambahkan 2026-08-19. Sebelumnya `lang` dikunci "id" di markup dan baru
// diperbaiki LanguageContext di dalam useEffect - artinya SETELAH hidrasi. Pembaca layar
// mengumumkan halaman dengan aturan pengucapan Indonesia sampai detik itu, dan bagi
// pengguna EN nilainya sempat salah pada frame-frame pertama.
//
// Dibaca di sini, BUKAN lewat cookies() di server component: `cookies()` menandai seluruh
// pohon render sebagai dinamis, dan itu akan mencabut prerender statis dari ~40 halaman -
// harga yang jauh lebih mahal daripada masalah yang diperbaiki. Preferensinya memang milik
// browser, jadi browser yang membacanya.
//
// CSP nonce mengubah trade-off tersebut secara sengaja: Next.js perlu nonce request-scoped
// untuk framework scripts, sehingga layout membaca x-nonce dari request dan seluruh pohon
// HTML menjadi dynamic-rendered. Ini harga eksplisit untuk menghapus script-src unsafe-inline.
const bootScript = `(function(){var d=document.documentElement;try{var saved=localStorage.getItem('sahamlens_theme');var system=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';var theme=saved==='light'||saved==='dark'?saved:system;d.classList.add(theme);d.style.colorScheme=theme;}catch(e){d.classList.add('dark');}try{var lang=localStorage.getItem('sahamlens_lang');if(lang==='en'||lang==='id')d.lang=lang;}catch(e){}})()`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`font-sans ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <head><script nonce={nonce} dangerouslySetInnerHTML={{ __html: bootScript }} /></head>
      <body className="bg-tv-bg text-tv-text antialiased min-h-screen relative selection:bg-tv-blue/25">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
