import './globals.css';
import { Plus_Jakarta_Sans, Sora, Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import React from 'react';
import AppShell from '@/components/AppShell';
import { SpeedInsights } from '@vercel/speed-insights/next';

// Trio font untuk kesan lebih modern/Gen Z: Jakarta Sans buat body (tetap, sudah
// enak dibaca), Sora buat heading (lebih tebal & punya karakter), Space Grotesk
// buat angka/harga (lebar digit seragam, umum dipakai di produk finansial modern).
// Sebelumnya Sora/Space Grotesk sudah didaftarkan di tailwind.config.js tapi tidak
// pernah benar-benar dimuat lewat next/font, jadi class font-heading/font-number
// selama ini jatuh ke fallback sistem.
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' });
const sora = Sora({ subsets: ['latin'], variable: '--font-sora' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk' });
// Redesign UI/UX Fase 1 - dipindah dari @import CSS manual (app/globals.css) ke
// next/font supaya SEMUA font di-self-host (satu pola konsisten, bukan campuran
// next/font + fetch CDN Google Fonts terpisah untuk font yang sama-sama dipakai).
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-jetbrains-mono' });

export const metadata = {
  title: 'SahamLens - Stock Screener IDX Smart AI',
  description: 'Stock Screener IDX Smart AI. Pure Algorithmic Trading (10 TS Analyzers) - Empowered by yfinance IDX Market Data (.JK) & AI Agent Engine. Bukan saran finansial, untuk edukasi.',
  manifest: '/manifest.json',
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
    <html lang="id" className={`dark ${jakarta.variable} ${sora.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body className={`${jakarta.className} bg-[#0F141D] text-slate-100 antialiased min-h-screen relative overflow-x-hidden selection:bg-[#3A86FF]/20`}>
        <AppShell>{children}</AppShell>
        <SpeedInsights />
      </body>
    </html>
  );
}
