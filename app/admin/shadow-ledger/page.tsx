import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { isAdminServer } from '@/modules/user';
import { getShadowLedgerDashboardData } from '@/modules/decision-agent';
import ShadowLedgerClient from './ShadowLedgerClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = {
  robots: { index: false, follow: false },
  title: 'Shadow Forward Ledger (Lengan B) | Admin SahamLens',
};

export default async function AdminShadowLedgerPage() {
  if (!(await isAdminServer())) {
    redirect('/admin-login');
  }

  const initialData = await getShadowLedgerDashboardData();

  return (
    <main className="min-h-screen bg-tv-bg p-4 text-tv-text sm:p-8 font-sans">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/admin"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-tv-muted transition-colors hover:text-tv-text"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Kembali ke Admin Panel</span>
        </Link>

        <ShadowLedgerClient initialData={initialData} />
      </div>
    </main>
  );
}
