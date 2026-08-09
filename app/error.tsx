'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <main className="flex min-h-[60dvh] items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-tv-border bg-tv-card p-6 text-center">
        <h1 className="text-xl font-bold text-white">Terjadi gangguan pada halaman</h1>
        <p className="mt-2 text-sm text-tv-muted">Data Anda tidak diubah. Coba muat ulang bagian ini.</p>
        <button type="button" onClick={reset} className="mt-5 rounded-lg bg-tv-accent px-4 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-tv-accent/60">
          Coba lagi
        </button>
      </div>
    </main>
  );
}
