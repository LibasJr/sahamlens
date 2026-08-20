import React from 'react';
import { cn } from '../../lib/utils/cn';

/**
 * Baris kepercayaan: umur data, cakupan, dan asal sumber dalam satu baris tenang.
 *
 * Presentasi murni. Ia merender keluaran `describeFreshness()`
 * (shared/presentation/freshness-labels.ts) - keputusan DELAYED/EOD/STALE/UNKNOWN tetap
 * milik server, dan primitif ini tidak boleh menambah aturan keduanya.
 *
 * PRD SEC.5.6: kepercayaan harus terlihat. Tapi ia konteks, bukan judul - karena itu
 * lens-meta dan warna teredam, kecuali yang memang perlu dicermati.
 */
export interface StatusMetaItem {
  label: string;
  tone?: 'neutral' | 'caution';
  /** Penjelasan hover, mis. waktu bar harga terakhir. */
  title?: string;
}

export function StatusMeta({ items, className }: { items: StatusMetaItem[]; className?: string }) {
  // Baris pemisah yang menggantung di bawah judul terlihat seperti kerusakan.
  if (items.length === 0) return null;

  return (
    <div className={cn('lens-meta flex flex-wrap items-center gap-x-2 gap-y-1 text-tv-muted', className)}>
      {items.map((item, index) => (
        <React.Fragment key={`${item.label}-${index}`}>
          {index > 0 && <span aria-hidden="true">·</span>}
          <span className={cn(item.tone === 'caution' && 'text-tv-yellow')} title={item.title}>
            {item.label}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}
