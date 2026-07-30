import './globals.css';
import { Plus_Jakarta_Sans } from 'next/font/google';
import React from 'react';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'] });
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
      <body className={`${jakarta.className} bg-[#F8FAFC] dark:bg-[#0B1121] text-slate-900 dark:text-slate-100 antialiased min-h-screen relative overflow-x-hidden selection:bg-[#3A86FF]/20`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
