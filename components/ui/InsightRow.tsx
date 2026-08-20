import React from 'react';
import { cn } from '../../lib/utils/cn';

/**
 * Satu temuan: arah, judul bahasa biasa, penjelasan, dan analyzer yang memilihnya.
 *
 * Bentuk "Yang penting dari [ticker]" (PRD SEC.17). Baris, bukan kartu: tiga sampai lima
 * temuan berturut-turut sebagai kartu menjadi dinding kotak, dan yang harus menonjol
 * adalah temuannya - bukan wadahnya.
 */
export type InsightDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

/** Simbol SELALU didampingi teks arah di `sr-only`: status tidak pernah hanya lewat warna,
 *  dan tidak pernah hanya lewat bentuk (WCAG 1.4.1, PRD SEC.24). */
const ARAH: Record<InsightDirection, { simbol: string; tone: string; teks: string }> = {
  BULLISH: { simbol: '↑', tone: 'text-tv-green', teks: 'condong positif' },
  BEARISH: { simbol: '↓', tone: 'text-tv-red', teks: 'condong negatif' },
  NEUTRAL: { simbol: '→', tone: 'text-tv-muted', teks: 'netral' },
};

export function InsightRow({
  direction,
  title,
  detail,
  source,
  className,
}: {
  direction: InsightDirection;
  title: string;
  detail?: string;
  source?: string;
  className?: string;
}) {
  const arah = ARAH[direction];

  return (
    <div className={cn('flex gap-3 py-2.5', className)}>
      <span className={cn('lens-metric shrink-0 leading-none', arah.tone)} aria-hidden="true">
        {arah.simbol}
      </span>
      <div className="min-w-0">
        <div className="lens-label text-tv-text">
          {title}
          <span className="sr-only"> — {arah.teks}</span>
        </div>
        {detail && <p className="lens-body-sm mt-0.5 text-tv-muted">{detail}</p>}
        {source && <div className="lens-meta mt-1 text-tv-muted/70">{source}</div>}
      </div>
    </div>
  );
}
