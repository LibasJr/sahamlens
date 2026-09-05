import type { ReactNode } from 'react';

export function generateStaticParams() {
  return [
    'top-gainer',
    'top-loser',
    'top-value',
    'top-volume',
    'weekly-gainer',
    'weekly-loser',
    'technical-bullish',
    'technical-bearish',
    'rsi-oversold',
  ].map((category) => ({ category }));
}

export default function MarketCategoryLayout({ children }: { children: ReactNode }) {
  return children;
}
