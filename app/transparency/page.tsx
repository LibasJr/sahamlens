import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import TransparencyClient from './TransparencyClient';

export default function TransparencyPage() {
  return (
    <div className="min-h-screen bg-tv-bg text-tv-text p-4 sm:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-tv-muted hover:text-tv-text transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Beranda
        </Link>

        <div className="mb-8">
          <p className="text-xs text-tv-accent font-semibold uppercase tracking-[0.2em] mb-2">
            Public Model Transparency
          </p>
          <h1 className="font-heading text-2xl sm:text-4xl font-bold text-tv-text">
            Transparansi Validasi LensRadar
          </h1>
          <p className="text-sm text-tv-muted mt-2 max-w-3xl">
            Halaman ini menampilkan performa historis LensScore secara point-in-time, agar
            pengguna bisa melihat apakah bucket skor tinggi benar-benar punya edge setelah biaya.
          </p>
        </div>

        <TransparencyClient />
      </div>
    </div>
  );
}
