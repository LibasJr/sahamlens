'use client';

import { Button } from '@/components/ui/Button';
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <html lang="id">
      <body className="bg-[#0b0e14] text-white">
        <main className="flex min-h-dvh items-center justify-center p-6">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <h1 className="text-xl font-bold">SahamLens mengalami gangguan</h1>
            <p className="mt-2 text-sm text-white/60">Silakan coba lagi. Jika masalah berulang, kembali ke halaman utama.</p>
            <div className="mt-5 flex justify-center gap-3">
              <Button variant="bare" size="none" type="button" onClick={reset} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold">Coba lagi</Button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
                  <a> DISENGAJA di sini, jangan diganti <Link>. global-error.tsx hanya
                  dirender ketika root layout SENDIRI gagal, dan file ini merender
                  <html>/<body>-nya sendiri karena layout itu tidak terpakai. Navigasi
                  client-side lewat <Link> menahan React tree yang sudah rusak tetap hidup;
                  yang dibutuhkan justru muat ulang penuh supaya aplikasi mulai dari nol. */}
              <a href="/" className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold">Beranda</a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
