'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';

export default function ClientHeader({ symbol }: { symbol: string }) {
  const router = useRouter();

  const handleTickerChange = (newTicker: string) => {
    const formattedTicker = newTicker.includes('.JK') ? newTicker : `${newTicker}.JK`;
    // Simpan ke key yang sama dipakai Teknikal/Fundamental/DCF supaya emiten yang
    // dicari di Council AI juga ikut ke halaman lain (dan sidebar), bukan cuma satu arah.
    window.localStorage.setItem('last_searched_ticker', formattedTicker);
    router.push(`/technical/${formattedTicker}`);
  };

  return <Header currentTicker={symbol.replace('.JK', '')} onTickerChange={handleTickerChange} />;
}
