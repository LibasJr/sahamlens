import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { isAdminServer } from '@/modules/user';
import CalibrationClient from './CalibrationClient';

export default async function AdminCalibrationPage() {
  if (!(await isAdminServer())) {
    redirect('/admin-login');
  }

  return (
    <div className="min-h-screen bg-tv-bg text-tv-text p-4 sm:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-tv-muted hover:text-tv-text transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Admin Panel
        </Link>

        <div className="mb-8">
          <p className="text-xs text-tv-accent font-semibold uppercase tracking-[0.2em] mb-2">
            Internal Quant Calibration
          </p>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-tv-text">
            LensRadar Calibration Lab
          </h1>
          <p className="text-sm text-tv-muted mt-2 max-w-3xl">
            Validasi apakah skor tinggi benar-benar memberi edge T+20, lalu simulasi dampak
            perubahan ambang rekomendasi terhadap win rate dan jumlah sinyal. Semua angka berasal
            dari histori real `lens_radar_history` dan hasil cron `lens_bucket_stats`.
          </p>
        </div>

        <CalibrationClient />
      </div>
    </div>
  );
}
