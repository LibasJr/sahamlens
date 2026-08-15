import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { isAdminServer } from '@/modules/user';
import JobsMonitorClient from './JobsMonitorClient';

export default async function AdminJobsPage() {
  if (!(await isAdminServer())) redirect('/admin-login');

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
            Scheduler Health
          </p>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-tv-text">
            Kesehatan Operasional
          </h1>
          <p className="text-sm text-tv-muted mt-2 max-w-4xl">
            Status aplikasi, cache/database, dan setiap job terjadwal ditampilkan dari pemeriksaan
            yang sudah ada. Error provider terlihat pada hasil job terakhir. Status deploy harus
            tetap diverifikasi dari GitHub Actions karena VPS tidak menyimpan riwayat deploy di database.
          </p>
        </div>

        <JobsMonitorClient />
      </div>
    </div>
  );
}
