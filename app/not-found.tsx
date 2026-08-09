import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-[60dvh] items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-tv-border bg-tv-card p-6 text-center">
        <div className="text-sm font-semibold uppercase tracking-wider text-tv-muted">404</div>
        <h1 className="mt-2 text-2xl font-bold text-white">Halaman tidak ditemukan</h1>
        <p className="mt-2 text-sm text-tv-muted">Periksa alamat atau kembali ke SahamLens.</p>
        <Link href="/" className="mt-5 inline-flex rounded-lg bg-tv-accent px-4 py-2 text-sm font-semibold text-white">Kembali ke beranda</Link>
      </div>
    </main>
  );
}
