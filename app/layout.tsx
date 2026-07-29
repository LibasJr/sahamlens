import './globals.css';
import { Inter } from 'next/font/google';
import React from 'react';

const inter = Inter({ subsets: ['latin'] });
import AppShell from '@/components/AppShell';

export const metadata = {
  title: 'SahamLens - Stock Screener IDX Institutional AI',
  description: 'Stock Screener IDX Institutional AI. Pure Algorithmic Trading (10 TS Analyzers) - Empowered by yfinance IDX Market Data (.JK) & AI Agent Engine. Bukan saran finansial, untuk edukasi.',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="dark">
      <body className={`${inter.className} bg-genz-base text-genz-text antialiased min-h-screen relative overflow-x-hidden selection:bg-genz-lime selection:text-genz-base`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
