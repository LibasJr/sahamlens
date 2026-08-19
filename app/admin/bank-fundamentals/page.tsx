import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Building2, ExternalLink, ShieldCheck, TriangleAlert } from 'lucide-react';
import { isAdminServer } from '@/modules/user';
import { getBankMetricCollectorAdminSummary, getBankMetricEvidenceAdminSummary } from '@/modules/fundamental/repository/bank-fundamental.repository';
import { Card } from '@/components/ui/Card';

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

function metricLabel(key: string) {
  return ({NIM_PCT:'NIM',NPL_GROSS_PCT:'NPL Gross',NPL_NET_PCT:'NPL Net',CASA_PCT:'CASA',CAR_PCT:'CAR',LDR_PCT:'LDR',COST_OF_CREDIT_PCT:'Cost of Credit',COST_TO_INCOME_PCT:'Cost-to-Income',COVERAGE_RATIO_PCT:'Coverage Ratio',PPOP_IDR:'PPOP'} as Record<string,string>)[key] ?? key;
}
function valueLabel(value: unknown, unit: unknown) {
  const n=Number(value); if(!Number.isFinite(n)) return '—';
  if(unit==='IDR') return new Intl.NumberFormat('id-ID',{notation:'compact',maximumFractionDigits:2,style:'currency',currency:'IDR'}).format(n);
  return `${n.toFixed(2)}%`;
}

export default async function BankFundamentalsAdminPage() {
  if (!(await isAdminServer())) redirect('/admin-login');
  const [data, collector]=await Promise.all([getBankMetricEvidenceAdminSummary(), getBankMetricCollectorAdminSummary()]);
  const totals=data.totals as {evidence_rows?:number;tickers?:number;periods?:number;latest_observed?:string|null};
  return <div className="min-h-screen bg-tv-bg p-4 text-tv-text sm:p-8"><div className="mx-auto max-w-7xl">
    <Link href="/admin" className="mb-5 inline-flex items-center gap-1.5 text-sm text-tv-muted hover:text-tv-text"><ArrowLeft className="h-4 w-4"/>Kembali ke Admin</Link>
    <div className="mb-7 flex items-start gap-3"><div className="rounded-xl bg-tv-blue/10 p-2.5 text-tv-blue"><Building2 className="h-6 w-6"/></div><div><h1 className="font-heading text-2xl font-bold sm:text-3xl">Bank Fundamentals Evidence</h1><p className="mt-1 max-w-3xl text-sm text-tv-muted">NIM, NPL, CASA, CAR, LDR, Cost of Credit, CIR, coverage, dan PPOP disimpan per metrik dengan provenance PIT. Belum menjadi input LensScore.</p></div></div>

    <div className="mb-6 rounded-xl border border-tv-green/25 bg-tv-green/5 p-4 text-sm"><div className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-tv-green"/><div><p className="font-semibold">Evidence per metrik, append-only</p><p className="mt-1 text-tv-muted">Setiap angka membawa period_end, observed_date, basis BANK_ONLY/CONSOLIDATED, tier sumber, URL, dan fingerprint. Koreksi tidak menimpa bukti lama.</p></div></div></div>

    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card><p className="text-xs text-tv-muted">Evidence rows</p><p className="mt-1 font-number text-2xl font-bold">{Number(totals.evidence_rows??0)}</p></Card>
      <Card><p className="text-xs text-tv-muted">Ticker</p><p className="mt-1 font-number text-2xl font-bold">{Number(totals.tickers??0)}</p></Card>
      <Card><p className="text-xs text-tv-muted">Period</p><p className="mt-1 font-number text-2xl font-bold">{Number(totals.periods??0)}</p></Card>
      <Card><p className="text-xs text-tv-muted">Observed terbaru</p><p className="mt-1 font-number text-base font-bold">{totals.latest_observed ? String(totals.latest_observed).slice(0,10) : '—'}</p></Card>
    </div>

    <div className="mb-6 rounded-xl border border-tv-yellow/25 bg-tv-yellow/5 p-4 text-sm"><div className="flex gap-2"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-tv-yellow"/><div><p className="font-semibold">DATA_ONLY</p><p className="mt-1 text-tv-muted">Coverage yang terlihat di sini tidak otomatis berarti score-ready. Basis campuran, metric derived, atau PIT yang belum kuat tetap ditahan dari LensScore sampai model bank divalidasi.</p></div></div></div>

    <h2 className="mb-3 font-heading text-lg font-bold">Auto Collector Sumber Resmi</h2>
    <Card className="mb-8 text-sm">
      {collector.latestRun ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-xs text-tv-muted">Run terakhir</p><p className="mt-1 font-number font-semibold">{collector.latestRun.startedAt ? collector.latestRun.startedAt.slice(0,19).replace('T',' ') : '—'}</p></div>
        <div><p className="text-xs text-tv-muted">Status</p><p className="mt-1 font-semibold">{collector.latestRun.status}</p></div>
        <div><p className="text-xs text-tv-muted">Dokumen</p><p className="mt-1 font-number font-semibold">{collector.latestRun.documentsParsed}/{collector.latestRun.documentsDiscovered} parsed</p></div>
        <div><p className="text-xs text-tv-muted">Evidence</p><p className="mt-1 font-number font-semibold">+{collector.latestRun.evidenceInserted} baru · {collector.latestRun.quarantined} quarantine</p></div>
      </div> : <p className="text-tv-muted">Belum ada collector run. Setelah migration 005, jalankan dry-run lalu pasang timer <code>deploy/bank-fundamental-collector</code>.</p>}
      <p className="mt-3 text-xs text-tv-muted">Collector hanya mengunjungi domain resmi issuer. PDF tanpa text-layer, angka ambigu, forecast/peer comparison, atau konflik antar dokumen tidak akan di-ingest; semuanya ditahan atau dilewati.</p>
    </Card>

    {collector.recentQuarantine.length > 0 && <>
      <h2 className="mb-3 font-heading text-lg font-bold">Quarantine Collector Terbaru</h2>
      <Card padding="none" className="mb-8 overflow-x-auto"><table className="min-w-full text-sm"><thead className="border-b border-tv-border text-left text-xs text-tv-muted"><tr><th className="p-3">Ticker</th><th className="p-3">Metric</th><th className="p-3">Period</th><th className="p-3">Alasan</th><th className="p-3">Source</th></tr></thead><tbody>{collector.recentQuarantine.map((r,i)=><tr key={`${r.ticker}-${r.metricKey}-${i}`} className="border-b border-tv-border/60 last:border-0"><td className="p-3 font-semibold">{r.ticker}</td><td className="p-3">{metricLabel(r.metricKey)}</td><td className="p-3 font-number">{r.periodEnd ?? '—'}</td><td className="p-3 text-xs">{r.reason ?? 'quarantined'}</td><td className="p-3"><a href={r.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex max-w-[260px] items-center gap-1 truncate text-tv-blue hover:underline">{r.sourceTitle}<ExternalLink className="h-3 w-3 shrink-0"/></a></td></tr>)}</tbody></table></Card>
    </>}

    <h2 className="mb-3 font-heading text-lg font-bold">Coverage per ticker</h2>
    <Card padding="none" className="mb-8 overflow-x-auto"><table className="min-w-full text-sm"><thead className="border-b border-tv-border text-left text-xs text-tv-muted"><tr><th className="p-3">Ticker</th><th className="p-3">Metrics</th><th className="p-3">Rows</th><th className="p-3">Latest period</th><th className="p-3">Derived</th><th className="p-3">Basis unspecified</th></tr></thead><tbody>{data.byTicker.map((r:any)=><tr key={r.ticker} className="border-b border-tv-border/60 last:border-0"><td className="p-3 font-semibold">{r.ticker}</td><td className="p-3 font-number">{r.metrics}/10</td><td className="p-3 font-number">{r.evidence_rows}</td><td className="p-3 font-number">{String(r.latest_period).slice(0,10)}</td><td className="p-3 font-number">{r.derived_rows}</td><td className="p-3 font-number">{r.unspecified_basis_rows}</td></tr>)}</tbody></table>{data.byTicker.length===0&&<p className="p-5 text-sm text-tv-muted">Belum ada evidence. Import CSV resmi setelah migration 004.</p>}</Card>

    <h2 className="mb-3 font-heading text-lg font-bold">Evidence terbaru</h2>
    <Card padding="none" className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="border-b border-tv-border text-left text-xs text-tv-muted"><tr><th className="p-3">Ticker</th><th className="p-3">Metric</th><th className="p-3">Value</th><th className="p-3">Period</th><th className="p-3">Basis</th><th className="p-3">Type</th><th className="p-3">Source</th></tr></thead><tbody>{data.recent.map((r:any,i:number)=><tr key={`${r.ticker}-${r.metric_key}-${i}`} className="border-b border-tv-border/60 last:border-0"><td className="p-3 font-semibold">{r.ticker}</td><td className="p-3">{metricLabel(r.metric_key)}</td><td className="p-3 font-number">{valueLabel(r.value,r.unit)}</td><td className="p-3 font-number">{String(r.period_end).slice(0,10)}</td><td className="p-3 text-xs">{r.basis}</td><td className="p-3 text-xs">{r.evidence_type}</td><td className="p-3"><a href={r.source_url} target="_blank" rel="noreferrer" className="inline-flex max-w-[280px] items-center gap-1 truncate text-tv-blue hover:underline">{r.source_title}<ExternalLink className="h-3 w-3 shrink-0"/></a></td></tr>)}</tbody></table></Card>
  </div></div>;
}
