import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { isAdminServer } from '@/modules/user';
import BrokerSummaryMonitorPanel from './BrokerSummaryMonitorPanel';
import {
  getBrokerSummaryMonitor,
  normalizeBrokerMonitorTicker,
} from '@/modules/broker-flow/service/broker-summary-monitor.service';

export const metadata = {
  robots: { index: false, follow: false },
};

interface BrokerSummaryPageProps {
  searchParams: Promise<{
    date?: string | string[];
    ticker?: string | string[];
  }>;
}

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default async function BrokerSummaryPage({ searchParams }: BrokerSummaryPageProps) {
  if (!(await isAdminServer())) {
    redirect('/admin-login');
  }

  const params = await searchParams;
  const requestedTicker = first(params.ticker).trim();
  const normalizedTicker = normalizeBrokerMonitorTicker(requestedTicker);
  const invalidTicker = requestedTicker.length > 0 && !normalizedTicker;
  let monitor = null;
  let monitorError: string | null = null;
  try {
    monitor = await getBrokerSummaryMonitor({
      date: first(params.date),
      ticker: normalizedTicker,
    });
  } catch {
    monitorError = 'Periksa koneksi database dan status scheduler, lalu muat ulang halaman.';
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
          <h1 className="font-heading text-2xl font-bold text-tv-text sm:text-3xl">Broker Summary & Bandarmology</h1>
          <p className="mt-2 max-w-3xl text-sm text-tv-muted">
            Pantau sinkronisasi otomatis EOD Broker Summary BEI dan analisis konsentrasi Bandarmology.
          </p>
        </div>
        <BrokerSummaryMonitorPanel
          monitor={monitor}
          error={monitorError}
          invalidTicker={invalidTicker}
        />
      </div>
    </div>
  );
}
