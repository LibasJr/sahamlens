import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { getTickerUmaStatus } from '@/modules/market/service/uma-status.service';

export default function UmaStatusBanner({ ticker }: { ticker: string }) {
  const code = ticker.replace(/\.JK$/i, '').toUpperCase();
  const uma = getTickerUmaStatus(code);

  if (!uma.isUma) {
    return null;
  }

  return (
    <div
      data-testid="uma-status-banner"
      className="flex items-start gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 shadow-sm"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-rose-500/20 px-2 py-0.5 text-xs font-bold tracking-wide text-rose-300 border border-rose-500/30">
            ⚠️ UMA (Unusual Market Activity)
          </span>
          {uma.lastUmaDate && (
            <span className="text-xs text-rose-200/80 font-mono">
              Per {uma.lastUmaDate} {uma.daysAgo !== null ? `(${uma.daysAgo} hari lalu)` : ''}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-rose-200/90">
          Saham ini dalam pengawasan bursa (BEI) karena pergerakan harga/pola transaksi di luar kebiasaan.
          Cermati keterbukaan informasi emiten dan waspadai risiko suspensi sementara perdagangan jika volatilitas berlanjut.
        </p>
        {uma.announcementNo && (
          <p className="mt-1 text-[11px] text-rose-300/70 truncate">
            Pengumuman BEI: {uma.announcementNo}
          </p>
        )}
      </div>
    </div>
  );
}