import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { isAdminServer } from '@/modules/user';
import BrokerEodPanel from './BrokerEodPanel';
import {
  getBrokerMarketDaily,
  normalizeBrokerMarketDate,
} from '@/modules/broker-flow/service/broker-market-daily.service';

export const metadata = {
  robots: { index: false, follow: false },
};

interface BrokerEodPageProps {
  searchParams: Promise<{ date?: string | string[] }>;
}

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default async function BrokerEodPage({ searchParams }: BrokerEodPageProps) {
  if (!(await isAdminServer())) {
    redirect('/admin-login');
  }

  const params = await searchParams;
  let data = null;
  let error: string | null = null;
  try {
    data = await getBrokerMarketDaily({ date: normalizeBrokerMarketDate(first(params.date)) });
  } catch {
    error = 'Periksa koneksi database, lalu muat ulang halaman.';
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
          <h1 className="font-heading text-2xl font-bold text-tv-text sm:text-3xl">Broker EOD BEI</h1>
          <p className="mt-2 max-w-3xl text-sm text-tv-muted">
            Ringkasan harian seluruh Anggota Bursa dari API resmi BEI: nilai transaksi, volume, dan frekuensi per kode
            broker. Data diambil oleh{' '}
            <code className="rounded bg-tv-card px-1.5 py-0.5">scripts/sync-idx-broker-summary.py</code> lalu diimpor
            oleh <code className="rounded bg-tv-card px-1.5 py-0.5">scripts/import-broker-market-daily.mjs</code>.
          </p>
        </div>

        <BrokerEodPanel data={data} error={error} />
      </div>
    </div>
  );
}
