'use client';

import { Button } from '@/components/ui/Button';
import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastVariant = 'info' | 'success' | 'error';

const VARIANT_CLASS: Record<ToastVariant, { border: string; icon: string }> = {
  info: { border: 'border-tv-blue/25', icon: 'text-tv-blue' },
  success: { border: 'border-tv-green/30', icon: 'text-tv-green' },
  error: { border: 'border-tv-red/30', icon: 'text-tv-red' },
};

/**
 * Lightweight app toast. It intentionally stays provider-free so pages can adopt it
 * incrementally without introducing a global state dependency. Re-rendering with a new
 * message re-opens the toast; callers can also change variant for success/error feedback.
 */
export default function Toast({
  message,
  durationMs = 5000,
  variant = 'info',
}: {
  message: string | null;
  durationMs?: number;
  variant?: ToastVariant;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!message) {
      setOpen(false);
      return;
    }
    setOpen(true);
    const timer = window.setTimeout(() => setOpen(false), durationMs);
    return () => window.clearTimeout(timer);
  }, [message, durationMs, variant]);

  const tone = VARIANT_CLASS[variant];
  const Icon = variant === 'success' ? CheckCircle2 : variant === 'error' ? AlertCircle : Info;

  if (!open || !message) return null;

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      // BARU (2026-08-14): dulu `bg-[#101A2A]/95` (navy gelap) dikunci mati - `text-tv-text`
      // di sampingnya IKUT tema (jadi navy gelap juga di tema terang), sehingga toast di tema
      // terang jadi teks gelap di atas latar gelap = tidak terbaca. Persis laporan pengguna
      // "form login" (banner notice "Silakan masuk untuk melanjutkan" tidak terbaca).
      // `bg-tv-card` sudah peka-tema (putih di terang, gelap di gelap) dan dipakai konsisten
      // di kartu lain - toast sekarang ikut aturan yang sama.
      className={`fixed left-1/2 top-4 z-[200] flex max-w-[92vw] -translate-x-1/2 items-start gap-2 rounded-2xl border bg-tv-card/95 px-4 py-3 text-[13px] text-tv-text shadow-2 backdrop-blur-xl ${tone.border}`}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.icon}`} />
      <span>{message}</span>
      <Button variant="bare" size="none"
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Tutup notifikasi"
        className="ml-1 shrink-0 rounded p-1 text-tv-muted transition-colors hover:text-tv-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tv-blue"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
