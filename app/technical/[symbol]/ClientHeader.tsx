'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';

export default function ClientHeader({ symbol }: { symbol: string }) {
  const router = useRouter();

  const handleTickerChange = (newTicker: string) => {
    const formattedTicker = newTicker.includes('.JK') ? newTicker : `${newTicker}.JK`;
    router.push(`/technical/${formattedTicker}`);
  };

  return <Header currentTicker={symbol.replace('.JK', '')} onTickerChange={handleTickerChange} />;
}
