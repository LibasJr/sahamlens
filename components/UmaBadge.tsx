import React from 'react';
import { getTickerUmaStatus } from '@/modules/market/service/uma-status.service';

export default function UmaBadge({ ticker }: { ticker: string }) {
  const code = ticker.replace(/\.JK$/i, '').toUpperCase();
  const uma = getTickerUmaStatus(code);

  if (!uma.isUma) {
    return null;
  }

  return (
    <span
      data-testid="uma-badge"
      title={`Dalam pengawasan Bursa (UMA) per ${uma.lastUmaDate ?? 'terbaru'}${uma.announcementNo ? ` - ${uma.announcementNo}` : ''}`}
      className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-xs font-bold text-rose-300 shadow-sm"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
      UMA
    </span>
  );
}