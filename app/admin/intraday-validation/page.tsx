import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { isAdminServer } from '@/modules/user';
import IntradayValidationClient from './IntradayValidationClient';

// Sama seperti /admin: halaman ini tidak boleh diundang untuk dirayapi.
export const metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminIntradayValidationPage() {
  // Gerbang UI. Gerbang SEBENARNYA ada di setiap route API
  // (app/api/admin/intraday-validation/**), yang menolak non-admin dengan 403
  // meskipun seseorang memanggilnya langsung tanpa pernah membuka halaman ini.
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

        <div className="mb-6">
          <p className="text-xs text-tv-accent font-semibold uppercase tracking-[0.2em] mb-2">
            Internal Intraday Research
          </p>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-tv-text">
            Intraday Validation Lab
          </h1>
          <p className="text-sm text-tv-muted mt-2 max-w-3xl">
            Laboratorium riset model <strong className="text-tv-text">LensIntraday</strong>: posisi dibuka dan
            ditutup pada hari bursa yang sama. Modul ini TERPISAH dari validasi LensScore T+20 (Calibration
            Lab, Robust Validation, TP/CL Lab) - tidak ada angka T+20 yang dipakai sebagai bukti di sini,
            dan tidak ada bobot/ambang produksi yang bisa berubah dari halaman ini.
          </p>
        </div>

        <IntradayValidationClient />
      </div>
    </div>
  );
}
