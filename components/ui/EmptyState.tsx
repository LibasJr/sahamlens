import React from 'react';
import { cn } from '../../lib/utils/cn';
import { Button } from './Button';

export type EmptyIllustration = 'collecting' | 'empty' | 'search' | 'locked';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  /**
   * Ilustrasi menggantikan `icon` kalau keduanya diisi. Dipakai untuk state kosong
   * yang perlu menjelaskan SEBAB kekosongan, bukan sekadar melaporkannya.
   */
  illustration?: EmptyIllustration;
  /**
   * Untuk data yang sedang dikumpulkan dan memang belum lengkap - mis. backtest
   * yang butuh 90 hari observasi. Menampilkan bar progres, bukan angka 0 telanjang.
   */
  progress?: { current: number; total: number; unit?: string; label?: string };
  /**
   * Tanggal saat data pertama diharapkan muncul. Ditampilkan sebagai tanggal +
   * sisa hari, jadi user tahu ini menunggu, bukan rusak.
   */
  countdown?: { targetDate: string | Date; label?: string };
  className?: string;
}

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Sisa hari dihitung pada kalender Asia/Jakarta di kedua sisi (server dan browser),
 * bukan pada zona waktu lokal masing-masing. Tanpa penyeragaman ini, hasil render
 * server dan client bisa beda satu hari dan React melaporkan hydration mismatch.
 */
function daysUntilJakarta(target: string | Date): number {
  const targetMs = (typeof target === 'string' ? new Date(target) : target).getTime();
  if (!Number.isFinite(targetMs)) return 0;
  const startOfDay = (ms: number) => Math.floor((ms + JAKARTA_OFFSET_MS) / MS_PER_DAY);
  return startOfDay(targetMs) - startOfDay(Date.now());
}

function formatJakartaDate(target: string | Date): string {
  const date = typeof target === 'string' ? new Date(target) : target;
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
}

function Illustration({ variant }: { variant: EmptyIllustration }) {
  const common = { width: 96, height: 72, viewBox: '0 0 96 72', fill: 'none', 'aria-hidden': true as const };

  if (variant === 'collecting') {
    // Batang yang tumbuh bertahap - membaca sebagai "sedang terisi", bukan "kosong".
    return (
      <svg {...common}>
        <rect x="10" y="52" width="12" height="12" rx="3" fill="#3B82F6" opacity="0.9" />
        <rect x="28" y="42" width="12" height="22" rx="3" fill="#3B82F6" opacity="0.65" />
        <rect x="46" y="34" width="12" height="30" rx="3" fill="#3B82F6" opacity="0.35" />
        <rect x="64" y="26" width="12" height="38" rx="3" fill="#1E293B" />
        <rect x="64" y="26" width="12" height="38" rx="3" stroke="#2B3A55" strokeDasharray="3 3" />
        <path d="M10 18h30" stroke="#2B3A55" strokeWidth="2" strokeLinecap="round" />
        <path d="M10 10h16" stroke="#2B3A55" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (variant === 'search') {
    return (
      <svg {...common}>
        <circle cx="42" cy="32" r="18" stroke="#2B3A55" strokeWidth="3" />
        <path d="M55 45l12 12" stroke="#3B82F6" strokeWidth="3" strokeLinecap="round" />
        <path d="M34 32h16M34 26h10" stroke="#2B3A55" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (variant === 'locked') {
    return (
      <svg {...common}>
        <rect x="32" y="32" width="32" height="26" rx="5" stroke="#2B3A55" strokeWidth="3" />
        <path d="M39 32v-6a9 9 0 0118 0v6" stroke="#3B82F6" strokeWidth="3" strokeLinecap="round" />
        <circle cx="48" cy="45" r="3" fill="#3B82F6" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect x="24" y="26" width="48" height="32" rx="5" stroke="#2B3A55" strokeWidth="3" />
      <path d="M24 38h48" stroke="#2B3A55" strokeWidth="2" />
      <path d="M36 48h10" stroke="#1E293B" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// State kosong yang konsisten di seluruh app. Aturannya: jangan pernah cuma
// melaporkan nol. Kalau penyebab kekosongan diketahui (data masih terkumpul,
// filter terlalu sempit, fitur terkunci), state ini yang menjelaskannya.
export function EmptyState({
  icon,
  title,
  description,
  action,
  illustration,
  progress,
  countdown,
  className,
}: EmptyStateProps) {
  const pct = progress && progress.total > 0
    ? Math.min(100, Math.max(0, (progress.current / progress.total) * 100))
    : 0;
  const remainingDays = countdown ? daysUntilJakarta(countdown.targetDate) : 0;

  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-6', className)}>
      {illustration ? (
        <div className="mb-4">
          <Illustration variant={illustration} />
        </div>
      ) : icon ? (
        <div className="w-12 h-12 rounded-full bg-tv-hover flex items-center justify-center text-tv-muted mb-4">
          {icon}
        </div>
      ) : null}

      <p className="font-heading text-sm font-semibold text-tv-text">{title}</p>
      {description && <p className="text-xs text-tv-muted mt-1.5 max-w-sm leading-relaxed">{description}</p>}

      {progress && (
        <div className="mt-5 w-full max-w-xs">
          <div className="flex items-baseline justify-between text-[11px] mb-1.5">
            <span className="text-tv-muted">{progress.label ?? 'Pengumpulan data'}</span>
            <span className="font-number font-semibold text-tv-text tabular-nums">
              {progress.current}/{progress.total}
              {progress.unit ? ` ${progress.unit}` : ''}
            </span>
          </div>
          <div
            className="h-2 w-full rounded-full bg-tv-hover overflow-hidden"
            role="progressbar"
            aria-valuenow={progress.current}
            aria-valuemin={0}
            aria-valuemax={progress.total}
          >
            <div
              className="h-full rounded-full bg-gradient-accent transition-[width] duration-700 ease-settle"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {countdown && (
        <p className="mt-4 text-[11px] text-tv-muted">
          {countdown.label ?? 'Perkiraan muncul'}{' '}
          <span className="font-number font-semibold text-tv-text">{formatJakartaDate(countdown.targetDate)}</span>
          {remainingDays > 0 && <span className="text-tv-muted"> &middot; {remainingDays} hari lagi</span>}
        </p>
      )}

      {action && (
        <Button variant="secondary" size="sm" className="mt-5" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

export default EmptyState;
