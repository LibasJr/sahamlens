import Link from 'next/link';

// Bukan <main>: AppShell sudah menyediakannya (lihat catatan di app/loading.tsx).
//
// `text-white` pada judul diganti `text-tv-text`. Kartunya berlatar bg-tv-card, dan
// --lens-card di tema terang bernilai putih murni - jadi judul "Halaman tidak ditemukan"
// selama ini putih di atas putih, tidak terbaca sama sekali oleh pengguna tema terang.
// Ini kasus persis CRITICAL-4 di audit UI/UX: palet Tailwind mentah menembus token tema.
export default function NotFound() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-tv-border bg-tv-card p-6 text-center">
        <div className="text-sm font-semibold uppercase tracking-wider text-tv-muted">404</div>
        <h1 className="mt-2 text-2xl font-bold text-tv-text">Halaman tidak ditemukan</h1>
        <p className="mt-2 text-sm text-tv-muted">Periksa alamat atau kembali ke SahamLens.</p>
        <Link
          href="/"
          className="mt-5 inline-flex rounded-lg bg-tv-blue px-4 py-2 text-sm font-semibold text-white"
        >
          Kembali ke beranda
        </Link>
      </div>
    </div>
  );
}
