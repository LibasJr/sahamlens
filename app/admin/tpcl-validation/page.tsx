import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { isAdminServer } from '@/modules/user';
import TpclValidationClient from './TpclValidationClient';

export default async function TpclValidationPage() {
  if (!(await isAdminServer())) redirect('/admin-login');

  return (
    <div className="min-h-screen bg-tv-bg text-tv-text p-4 sm:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <Link
          href="/admin/calibration"
          className="inline-flex items-center gap-1.5 text-sm text-tv-muted hover:text-tv-text transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke LensRadar Calibration
        </Link>

        <div className="mb-8">
          <p className="text-xs text-tv-accent font-semibold uppercase tracking-[0.2em] mb-2">
            Internal Quant Risk Validation
          </p>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-tv-text">
            TP / CL Validation Lab
          </h1>
          <p className="text-sm text-tv-muted mt-2 max-w-4xl">
            Uji historis engine TP/CL yang sama dengan production: structure + ATR + fraksi harga IDX.
            Halaman ini hanya diagnostic research. Candidate parameter tidak pernah di-apply otomatis.
          </p>
        </div>

        <TpclValidationClient />
      </div>
    </div>
  );
}
