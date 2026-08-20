import React from 'react';
import { cn } from '../../lib/utils/cn';

/**
 * Kepala sebuah bagian riset: eyebrow, judul, lede, dan satu aksi opsional.
 *
 * Pola ini sebelumnya disalin tangan di halaman technical, blok Flow, dan Hari Ini -
 * tiga salinan yang bebas menyimpang satu sama lain. Menyatukannya membuat ritme antar
 * bagian menjadi properti sistem, bukan hasil kebetulan.
 *
 * BUKAN kartu. Bagian dipisahkan oleh whitespace dan tipografi (PRD SEC.5.3); membungkus
 * tiap kepala bagian dengan border justru menambah densitas kartu yang sedang dikurangi.
 */
interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  lede?: string;
  action?: React.ReactNode;
  /** Dipasang pada headingnya, bukan pembungkusnya, supaya jangkar mendarat di judul. */
  id?: string;
  as?: 'h2' | 'h3';
  className?: string;
}

export function SectionHeader({
  eyebrow,
  title,
  lede,
  action,
  id,
  as = 'h2',
  className,
}: SectionHeaderProps) {
  const Heading = as;

  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-4 gap-y-1', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="lens-eyebrow mb-1 text-tv-muted">{eyebrow}</div>
        )}
        <Heading
          id={id}
          className={cn('lens-anchor-offset', as === 'h2' ? 'lens-section-title' : 'lens-label text-tv-text')}
        >
          {title}
        </Heading>
        {lede && <p className="lens-body-sm mt-1 max-w-2xl text-tv-muted">{lede}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
