import './globals.css';
import React from 'react';
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
      <body className="bg-tv-bg text-tv-text antialiased min-h-screen relative overflow-x-hidden">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
