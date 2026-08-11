'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';

export default function ClientHeader({ symbol }: { symbol: string }) {
  const router = useRouter();

  // Halaman ini dibuka lewat path segment ([symbol] di URL, mis. link dari kartu
  // saham di landing/watchlist), bukan lewat kotak cari di Header - sebelumnya
  // localStorage cuma ditulis saat user AKTIF mencari di halaman ini, jadi emiten
  // yang dilihat lewat klik link tidak pernah tersimpan, dan Fundamental/DCF yang
  // dibuka setelahnya tidak tahu emiten ini baru dilihat (jatuh ke default TLKM/BBCA).
  useEffect(() => {
    const formattedTicker = symbol.startsWith('^') ? symbol : symbol.includes('.JK') ? symbol : `${symbol}.JK`;
    if (!formattedTicker.startsWith('^')) {
      window.localStorage.setItem('last_searched_ticker', formattedTicker);
    }
  }, [symbol]);

  const handleTickerChange = (newTicker: string) => {
    const formattedTicker = newTicker.startsWith('^') ? newTicker : newTicker.includes('.JK') ? newTicker : `${newTicker}.JK`;
    // Simpan ke key yang sama dipakai Teknikal/Fundamental/DCF supaya emiten yang
    // dicari di LensAI juga ikut ke halaman lain (dan sidebar), bukan cuma satu arah.
    if (!formattedTicker.startsWith('^')) {
      window.localStorage.setItem('last_searched_ticker', formattedTicker);
    }
    const routeSymbol = formattedTicker.startsWith('^') ? 'IHSG' : formattedTicker;
    router.push(`/technical/${encodeURIComponent(routeSymbol)}`);
  };

  return <Header currentTicker={symbol === '^JKSE' ? 'IHSG' : symbol.replace('.JK', '')} onTickerChange={handleTickerChange} />;
}
