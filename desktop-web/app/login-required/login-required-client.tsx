'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LockKeyhole, LogIn, RotateCcw } from 'lucide-react';
import { safeInternalPath } from '@/shared/navigation/safe-internal-path';
import { Card, Skeleton } from '@/components/ui';

function LoginRequiredContent() {
  const searchParams = useSearchParams();
  const nextPath = safeInternalPath(searchParams.get('next') ?? undefined);
  const feature = searchParams.get('feature')?.trim().slice(0, 60);
  const loginHref = `/login?next=${encodeURIComponent(nextPath)}&notice=login_required`;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center p-4 md:p-6">
      <Card as="section" className="w-full max-w-2xl px-5 py-8 text-center sm:px-8 md:py-10">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-tv-blue/15 bg-tv-blue/[0.07] text-tv-blue">
          <LockKeyhole className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-5 font-heading text-lg font-bold tracking-tight text-tv-text md:text-xl">Fitur ini memerlukan akun</h1>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-tv-muted">
          Silakan masuk untuk melanjutkan{feature ? ` dan membuka ${feature}` : ' dan menggunakan fitur ini'}.
        </p>
        <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Link href={loginHref} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-tv-blue px-6 py-3 text-sm font-bold text-white hover:bg-tv-blueHover">
            <LogIn className="h-4 w-4" aria-hidden="true" /> Masuk untuk melanjutkan
          </Link>
          <Link href="/" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-tv-border bg-tv-hover px-6 py-3 text-sm font-semibold text-tv-text hover:border-tv-borderLight">
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Kembali ke beranda
          </Link>
        </div>
      </Card>
    </div>
  );
}

export default function LoginRequiredClient() {
  return (
    <Suspense fallback={<div className="p-8"><Skeleton className="mx-auto h-64 max-w-2xl" /></div>}>
      <LoginRequiredContent />
    </Suspense>
  );
}
