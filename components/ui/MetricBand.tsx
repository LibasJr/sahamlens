import React from 'react';
import { cn } from '../../lib/utils/cn';
import { Skeleton } from './Skeleton';

/**
 * Deret metrik yang dibaca sebagai satu baris konteks, bukan sebagai empat objek terpisah.
 *
 * `MetricCard` yang sudah ada adalah KARTU - tepat untuk metrik yang berdiri sendiri dan
 * bisa diklik. Band ini kebalikannya: angka-angka yang hanya punya arti bersama-sama
 * (IHSG, breadth, regime, kandidat radar), jadi membungkus masing-masing dengan border
 * justru memutus hubungan yang ingin ditunjukkan (PRD SEC.13).
 */
export interface MetricBandItem {
  label: string;
  /** null berarti datanya memang belum ada - band menyatakan itu, bukan menulis "-". */
  value: string | null;
  detail?: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'caution';
  emptyHint?: string;
  /**
   * Metrik ini masih dimuat.
   *
   * Per-item, bukan per-band: di beranda IHSG, breadth, dan hasil radar datang dari tiga
   * request berbeda yang selesai pada waktu berbeda. Satu bendera untuk seluruh band akan
   * menahan angka yang sudah siap sampai yang paling lambat tiba.
   */
  loading?: boolean;
}

const TONE: Record<NonNullable<MetricBandItem['tone']>, string> = {
  neutral: 'text-tv-text',
  positive: 'text-tv-green',
  negative: 'text-tv-red',
  caution: 'text-tv-yellow',
};

export function MetricBand({ items, className }: { items: MetricBandItem[]; className?: string }) {
  return (
    <div
      className={cn(
        // 2 kolom di ponsel (PRD SEC.13), sebaris begitu ada ruang. Dipisah jarak, bukan
        // kartu - hubungan antar angka justru yang ingin terbaca.
        'grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4',
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <div className="lens-label mb-1 truncate text-tv-muted">{item.label}</div>
          {item.loading ? (
            <Skeleton variant="text" className="mt-1 h-6 w-20" />
          ) : item.value === null ? (
            <div className="lens-body-sm text-tv-muted">{item.emptyHint ?? 'belum ada data'}</div>
          ) : (
            <div className={cn('lens-metric', TONE[item.tone ?? 'neutral'])}>{item.value}</div>
          )}
          {item.detail && item.value !== null && !item.loading && (
            <div className={cn('lens-meta mt-0.5', TONE[item.tone ?? 'neutral'])}>{item.detail}</div>
          )}
        </div>
      ))}
    </div>
  );
}
