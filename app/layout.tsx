import './globals.css';
import React from 'react';
import Sidebar from '@/components/Sidebar';

export const metadata = {
  title: 'SahamLens Super App - IDX Institutional AI Stock Platform',
  description: 'Aplikasi Analitik & Intelijen Saham IDX Tingkat Institusional dengan 10 Modul AI Agent (Goldman Sachs, Morgan Stanley, Bridgewater, JPMorgan, BlackRock, Citadel, Harvard, Bain, Renaissance, McKinsey)',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="dark">
      <body className="bg-tv-bg text-tv-text antialiased min-h-screen flex">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 min-h-screen overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
