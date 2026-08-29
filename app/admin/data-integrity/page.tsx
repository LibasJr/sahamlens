import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { getLatestReconciliationIssues, getReconciliationSummary } from '@/modules/market-data-integrity/repository/market-data-reconciliation.repository';
import { isAdminServer } from '@/modules/user';
import { redirect } from 'next/navigation';

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

function label(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '-';
  return text
    .replace('IDX_TRADING_INFO_SS_ARTIFACT', 'IDX resmi')
    .replace('YAHOO_CHART', 'Yahoo pembanding');
}

function formatClose(value: unknown): string {
  return value == null ? '-' : Number(value).toLocaleString('id-ID');
}

export default async function MarketDataIntegrityAdminPage() {
  if (!(await isAdminServer())) redirect('/admin-login');
  const [runs, issues] = await Promise.all([getReconciliationSummary(30), getLatestReconciliationIssues(100)]);
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6 text-tv-text">
      <div>
        <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 text-sm text-tv-muted hover:text-tv-text">
          <ArrowLeft className="h-4 w-4" /> Kembali ke Admin
        </Link>
        <h1 className="text-2xl font-bold">Pemeriksaan Harga Penutupan</h1>
        <p className="mt-1 max-w-3xl text-sm text-tv-muted">
          Rekonsiliasi harian harga penutupan: IDX resmi sebagai sumber utama, Yahoo hanya pembanding. Mismatch/gap tidak diperbaiki otomatis; ticker ditandai untuk pemeriksaan.
        </p>
      </div>
      <Card as="div" className="overflow-x-auto border-tv-border" padding="none" radius="xl" surface="solid" elevation="none" overflow="visible" highlight={false}>
        <table className="min-w-full text-sm">
          <thead className="border-b border-tv-border text-left text-tv-muted"><tr><th className="p-3">Tanggal</th><th className="p-3">Sumber utama</th><th className="p-3">Pembanding</th><th className="p-3">Status</th><th className="p-3">Dibandingkan</th><th className="p-3">Cocok</th><th className="p-3">Beda</th><th className="p-3">Hanya IDX</th><th className="p-3">Hanya Yahoo</th><th className="p-3">Tidak ada data</th></tr></thead>
          <tbody>{runs.map((run) => <tr key={String(run.run_id)} className="border-b border-tv-border/60"><td className="p-3">{String(run.trade_date ?? '-')}</td><td className="p-3">{label(run.primary_source)}</td><td className="p-3">{label(run.secondary_source)}</td><td className="p-3 font-semibold">{String(run.status)}</td><td className="p-3">{String(run.compared_count)}</td><td className="p-3 text-tv-green">{String(run.match_count)}</td><td className="p-3 text-amber-300">{String(run.mismatch_count)}</td><td className="p-3">{String(run.primary_only_count)}</td><td className="p-3">{String(run.secondary_only_count)}</td><td className="p-3">{String(run.no_data_count ?? 0)}</td></tr>)}</tbody>
        </table>
      </Card>
      <div className="space-y-2">
        <h2 className="text-lg font-bold">Ticker yang perlu diperiksa</h2>
        {issues.length === 0 ? <p className="text-sm text-tv-muted">Belum ada mismatch/gap yang tersimpan.</p> : (
          <Card as="div" className="overflow-x-auto border-tv-border" padding="none" radius="xl" surface="solid" elevation="none" overflow="visible" highlight={false}>
            <table className="min-w-full text-sm">
              <thead className="border-b border-tv-border text-left text-tv-muted"><tr><th className="p-3">Ticker</th><th className="p-3">Tanggal</th><th className="p-3">Status</th><th className="p-3">Harga IDX resmi</th><th className="p-3">Harga Yahoo pembanding</th><th className="p-3">Selisih</th></tr></thead>
              <tbody>{issues.map((row, i) => <tr key={`${String(row.ticker)}-${String(row.trade_date)}-${i}`} className="border-b border-tv-border/60"><td className="p-3 font-bold">{String(row.ticker)}</td><td className="p-3">{String(row.trade_date)}</td><td className="p-3 text-amber-300">{String(row.status)}</td><td className="p-3">{formatClose(row.primary_close)}</td><td className="p-3">{formatClose(row.secondary_close)}</td><td className="p-3">{row.diff_pct == null ? '-' : `${Number(row.diff_pct).toFixed(4)}%`}</td></tr>)}</tbody>
            </table>
          </Card>
        )}
      </div>
    </main>
  );
}
