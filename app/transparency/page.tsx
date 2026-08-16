import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import TransparencyClient from './TransparencyClient';

export default function TransparencyPage() {
  return (
    <div className="min-h-screen bg-tv-bg text-tv-text p-4 sm:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <Link
          href="/"
          className="mb-4 inline-flex min-h-6 items-center gap-1.5 text-sm text-tv-muted transition-colors hover:text-tv-text"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Beranda
        </Link>

        <div className="mb-8">
          <p className="text-xs text-tv-accent font-semibold uppercase tracking-[0.2em] mb-2">
            Public Model Transparency
          </p>
          <h1 className="lens-page-title">
            Transparansi Validasi LensRadar
          </h1>
          <p className="text-sm text-tv-muted mt-2 max-w-3xl">
            Halaman ini menampilkan performa historis LensScore secara point-in-time, agar
            pengguna bisa melihat apakah bucket skor tinggi benar-benar punya edge setelah biaya.
          </p>
        </div>

        <section className="mb-6 rounded-xl border border-tv-border bg-tv-card p-4 sm:p-5">
          <h2 className="text-base font-semibold text-tv-text">Komitmen Integritas Data</h2>
          <div className="mt-3 grid gap-3 text-sm text-tv-muted md:grid-cols-2">
            <p><span className="font-semibold text-tv-text">Fail-closed.</span> Data yang tidak tersedia ditampilkan sebagai N/A/null, bukan diganti angka netral atau estimasi tanpa sumber.</p>
            <p><span className="font-semibold text-tv-text">Point-in-time.</span> Backfill yang baru diketahui setelah tanggal historis tidak diperlakukan sebagai sinyal yang tersedia pada masa lalu.</p>
            <p><span className="font-semibold text-tv-text">Research-only sampai tervalidasi.</span> Status model tidak dinaikkan hanya karena backtest terlihat baik; forward OOS dan gate sampel tetap wajib.</p>
            <p><span className="font-semibold text-tv-text">Reproducible.</span> Perubahan scoring, asumsi makro, parameter riset, dan schema dipisahkan lewat versi/migration agar hasil lama dapat diaudit.</p>
          </div>
          <p className="mt-3 text-xs text-tv-muted">SahamLens adalah alat riset dan analisis, bukan jaminan hasil investasi. Detail risiko dan batas penggunaan tersedia di halaman Disclaimer.</p>
        </section>

        <TransparencyClient />
      </div>
    </div>
  );
}
