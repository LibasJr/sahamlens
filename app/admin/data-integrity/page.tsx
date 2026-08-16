import { getLatestReconciliationIssues, getReconciliationSummary } from '@/modules/market-data-integrity/repository/market-data-reconciliation.repository';
import { isAdminServer } from '@/modules/user';
import { redirect } from 'next/navigation';

export default async function MarketDataIntegrityAdminPage() {
  if (!(await isAdminServer())) redirect('/admin-login');
  const [runs, issues] = await Promise.all([getReconciliationSummary(30), getLatestReconciliationIssues(100)]);
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6 text-tv-text">
      <div>
        <h1 className="text-2xl font-bold">Market Data Integrity</h1>
        <p className="mt-1 text-sm text-tv-muted">Rekonsiliasi harian harga penutupan. Mismatch tidak diperbaiki otomatis; ia ditandai untuk pemeriksaan.</p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-tv-border bg-tv-card">
        <table className="min-w-full text-sm">
          <thead className="border-b border-tv-border text-left text-tv-muted"><tr><th className="p-3">Tanggal</th><th className="p-3">Status</th><th className="p-3">Compared</th><th className="p-3">Match</th><th className="p-3">Mismatch</th><th className="p-3">Primary only</th><th className="p-3">Secondary only</th><th className="p-3">No data</th></tr></thead>
          <tbody>{runs.map((run) => <tr key={String(run.run_id)} className="border-b border-tv-border/60"><td className="p-3">{String(run.trade_date ?? '-')}</td><td className="p-3 font-semibold">{String(run.status)}</td><td className="p-3">{String(run.compared_count)}</td><td className="p-3 text-tv-green">{String(run.match_count)}</td><td className="p-3 text-amber-300">{String(run.mismatch_count)}</td><td className="p-3">{String(run.primary_only_count)}</td><td className="p-3">{String(run.secondary_only_count)}</td><td className="p-3">{String(run.no_data_count ?? 0)}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-bold">Ticker yang perlu diperiksa</h2>
        {issues.length === 0 ? <p className="text-sm text-tv-muted">Belum ada mismatch/gap yang tersimpan.</p> : (
          <div className="overflow-x-auto rounded-xl border border-tv-border bg-tv-card">
            <table className="min-w-full text-sm">
              <thead className="border-b border-tv-border text-left text-tv-muted"><tr><th className="p-3">Ticker</th><th className="p-3">Tanggal</th><th className="p-3">Status</th><th className="p-3">Yahoo</th><th className="p-3">Pembanding</th><th className="p-3">Selisih</th></tr></thead>
              <tbody>{issues.map((row, i) => <tr key={`${String(row.ticker)}-${String(row.trade_date)}-${i}`} className="border-b border-tv-border/60"><td className="p-3 font-bold">{String(row.ticker)}</td><td className="p-3">{String(row.trade_date)}</td><td className="p-3 text-amber-300">{String(row.status)}</td><td className="p-3">{row.primary_close == null ? '-' : Number(row.primary_close).toLocaleString('id-ID')}</td><td className="p-3">{row.secondary_close == null ? '-' : Number(row.secondary_close).toLocaleString('id-ID')}</td><td className="p-3">{row.diff_pct == null ? '-' : `${Number(row.diff_pct).toFixed(4)}%`}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
