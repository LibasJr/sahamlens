'use client';

import React from 'react';
import { cn } from '../../lib/utils/cn';
import { AnimatedNumber } from './AnimatedNumber';

export type MetricTone = 'auto' | 'neutral' | 'positive' | 'negative';

interface MetricCardProps {
  label: string;
  /**
   * null/undefined berarti data memang belum ada. Card TIDAK akan menampilkan
   * "-" polos; ia menampilkan `emptyHint` supaya user tahu penyebabnya.
   */
  value: number | null | undefined;
  format?: (n: number) => string;
  /** Perubahan dalam persen. Menentukan warna kalau tone = 'auto'. */
  deltaPct?: number | null;
  /** Keterangan periode delta, mis. "vs kemarin". */
  deltaLabel?: string;
  /** Deret nilai historis untuk sparkline. Minimal 2 titik, kalau kurang tidak digambar. */
  sparkline?: number[];
  icon?: React.ReactNode;
  tone?: MetricTone;
  /** Satu kalimat konteks di bawah angka - bagian "storytelling", bukan angka lagi. */
  hint?: string;
  emptyHint?: string;
  suffix?: string;
  className?: string;
  onClick?: () => void;
}

const TONE_TEXT: Record<Exclude<MetricTone, 'auto'>, string> = {
  neutral: 'text-tv-text',
  positive: 'text-tv-green',
  negative: 'text-tv-red',
};

function resolveTone(tone: MetricTone, deltaPct: number | null | undefined): Exclude<MetricTone, 'auto'> {
  if (tone !== 'auto') return tone;
  if (deltaPct === null || deltaPct === undefined || deltaPct === 0) return 'neutral';
  return deltaPct > 0 ? 'positive' : 'negative';
}

/**
 * Sparkline digambar sebagai SVG polyline langsung, bukan lewat Recharts.
 * Pada ukuran 64x20px sebuah chart library tidak memberi apa pun yang tidak
 * diberikan satu elemen <polyline>, sementara ia menambah satu container
 * responsif + observer per kartu.
 */
function Sparkline({ points, stroke }: { points: number[]; stroke: string }) {
  const width = 64;
  const height = 20;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const path = points
    .map((p, i) => `${(i * step).toFixed(1)},${(height - ((p - min) / span) * height).toFixed(1)}`)
    .join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible shrink-0" aria-hidden="true">
      {/* style, bukan atribut `stroke`: atribut presentasi SVG diurai sebagai nilai
          atribut, bukan CSS, jadi rgb(var(--lens-green)) tidak akan pernah resolve
          di sana. Lewat style ia melewati mesin CSS dan ikut tema. */}
      <polyline points={path} fill="none" style={{ stroke }} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MetricCard({
  label,
  value,
  format = (n) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 }),
  deltaPct,
  deltaLabel,
  sparkline,
  icon,
  tone = 'auto',
  hint,
  emptyHint = 'Data belum tersedia',
  suffix,
  className,
  onClick,
}: MetricCardProps) {
  const hasValue = value !== null && value !== undefined && Number.isFinite(value);
  const resolvedTone = resolveTone(tone, deltaPct);
  // Hex mati di sini adalah nilai tema gelap; di kartu putih garis 1,5px #22C55E
  // terukur 2,28:1 - di bawah ambang 3:1 untuk elemen grafis.
  const strokeColor = resolvedTone === 'positive'
    ? 'rgb(var(--lens-green))'
    : resolvedTone === 'negative'
      ? 'rgb(var(--lens-red))'
      : 'rgb(var(--lens-blue))';
  const interactive = Boolean(onClick);

  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } } : undefined}
      className={cn(
        'relative overflow-hidden rounded-2xl border border-white/[0.075] bg-tv-card p-4 shadow-1 transition-all duration-250 ease-settle',
        interactive && 'cursor-pointer hover:-translate-y-0.5 hover:border-white/[0.13] hover:shadow-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-tv-blue/60',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="shrink-0 text-tv-muted">{icon}</span>}
          <span className="lens-eyebrow truncate">{label}</span>
        </div>
        {hasValue && sparkline && sparkline.length >= 2 && <Sparkline points={sparkline} stroke={strokeColor} />}
      </div>

      {hasValue ? (
        <>
          <div className="mt-2 flex items-baseline gap-1.5">
            <AnimatedNumber
              value={value as number}
              format={format}
              className={cn('font-number text-2xl font-bold tracking-tight tabular-nums', TONE_TEXT[resolvedTone])}
            />
            {suffix && <span className="text-sm font-medium text-tv-muted">{suffix}</span>}
          </div>

          {deltaPct !== null && deltaPct !== undefined && Number.isFinite(deltaPct) && (
            <div className="lens-body-sm mt-1.5 flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  'font-number font-semibold tabular-nums',
                  deltaPct > 0 ? 'text-tv-green' : deltaPct < 0 ? 'text-tv-red' : 'text-tv-muted'
                )}
              >
                {deltaPct > 0 ? '+' : ''}
                {deltaPct.toFixed(2)}%
              </span>
              {deltaLabel && <span className="text-tv-muted truncate">{deltaLabel}</span>}
            </div>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-tv-muted leading-snug">{emptyHint}</p>
      )}

      {hint && <p className="lens-body-sm mt-2 text-tv-muted/80">{hint}</p>}
    </div>
  );
}

export default MetricCard;
