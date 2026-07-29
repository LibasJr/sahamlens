import './globals.css';
import { Inter } from 'next/font/google';
import React from 'react';

const inter = Inter({ subsets: ['latin'] });
import AppShell from '@/components/AppShell';

export const metadata = {
  title: 'SahamLens - Stock Screener IDX Institutional AI',
  description: 'Stock Screener IDX Institutional AI. Pure Algorithmic Trading (10 TS Analyzers) - Empowered by yfinance IDX Market Data (.JK) & AI Agent Engine. Bukan saran finansial, untuk edukasi.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="dark">
      <body className={`${inter.className} bg-[#0B0E14] text-slate-200 antialiased min-h-screen relative overflow-x-hidden selection:bg-teal-500/30 selection:text-teal-200`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
