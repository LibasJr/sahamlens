import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { isAdminServer } from '@/modules/user';
import FundamentalBackfillClient from './FundamentalBackfillClient';

export default async function AdminFundamentalBackfillPage() {
  if (!(await isAdminServer())) {
    redirect('/admin-login');
  }

  return (
    <div className="min-h-screen bg-tv-bg p-4 text-tv-text sm:p-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/admin"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-tv-muted transition-colors hover:text-tv-text"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Admin
        </Link>
        <div className="mb-8">
          <h1 className="font-heading text-2xl font-bold text-tv-text sm:text-3xl">Fundamental Backfill</h1>
          <p className="mt-2 max-w-3xl text-sm text-tv-muted">
            Import snapshot fundamental point-in-time ke fundamental_history tanpa terminal.
            Gunakan Dry Run dulu, lalu Insert jika hasilnya benar.
          </p>
        </div>
        <FundamentalBackfillClient />
      </div>
    </div>
  );
}
