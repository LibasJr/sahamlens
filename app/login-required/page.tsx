import type { Metadata } from 'next';
import Link from 'next/link';
import { LockKeyhole, LogIn, RotateCcw } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Login diperlukan',
  robots: { index: false, follow: false },
};

function safeInternalPath(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return '/home';
  return candidate;
}

export default async function LoginRequiredPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; feature?: string | string[] }>;
}) {
  const params = await searchParams;
  const nextPath = safeInternalPath(params.next);
  const rawFeature = Array.isArray(params.feature) ? params.feature[0] : params.feature;
  const feature = rawFeature?.trim().slice(0, 60);
  const loginHref = `/login?next=${encodeURIComponent(nextPath)}&notice=login_required`;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center p-4 md:p-8">
      <section className="w-full max-w-3xl rounded-2xl border border-tv-border bg-tv-card px-6 py-12 text-center shadow-2 md:px-10 md:py-16">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-tv-blue/15 bg-tv-blue/[0.07] text-tv-blue">
          <LockKeyhole className="h-8 w-8" aria-hidden="true" />
        </div>

        <h1 className="mt-6 font-heading text-xl font-bold tracking-tight text-tv-text md:text-2xl">
          Fitur ini memerlukan akun
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-tv-muted md:text-base">
          Silakan masuk untuk melanjutkan{feature ? ` dan membuka ${feature}` : ' dan menggunakan fitur ini'}.
        </p>

        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Link
            href={loginHref}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-tv-blue px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-tv-blueHover"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Masuk untuk melanjutkan
          </Link>
          <Link
            href="/home"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-tv-border bg-tv-hover px-6 py-3 text-sm font-semibold text-tv-text transition-colors hover:border-tv-borderLight"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Kembali ke beranda
          </Link>
        </div>
      </section>
    </div>
  );
}
