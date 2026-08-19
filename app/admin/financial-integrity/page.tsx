import { Card } from '@/components/ui';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Building2, BarChart3, ShieldCheck, TriangleAlert, Waves } from 'lucide-react';
import { isAdminServer } from '@/modules/user';
import { getMacroAdoptionAnalysis } from '@/modules/macro/service/macro-adoption-analysis.service';
import { getBankEvidenceMaturityReport } from '@/modules/fundamental/service/bank-evidence-maturity.service';

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

function pct(value: number | null | undefined, digits = 2) {
  return value == null ? '—' : `${value.toFixed(digits)}%`;
}

function statusClass(status: string) {
  if (status.includes('BLOCKED') || status.includes('INCOMPLETE')) return 'border-tv-yellow/30 bg-tv-yellow/10 text-tv-yellow';
  return 'border-tv-blue/30 bg-tv-blue/10 text-tv-blue';
}

export default async function FinancialIntegrityAdminPage() {
  if (!(await isAdminServer())) redirect('/admin-login');
  const [macro, bank] = await Promise.all([
    getMacroAdoptionAnalysis(),
    getBankEvidenceMaturityReport(),
  ]);

  return (
    <div className="min-h-screen bg-tv-bg p-4 text-tv-text sm:p-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin" className="mb-5 inline-flex items-center gap-1.5 text-sm text-tv-muted hover:text-tv-text">
          <ArrowLeft className="h-4 w-4" /> Kembali ke Admin
        </Link>

        <div className="mb-7 flex items-start gap-3">
          <div className="rounded-xl bg-tv-purple/10 p-2.5 text-tv-purple"><BarChart3 className="h-6 w-6" /></div>
          <div>
            <h1 className="font-heading text-2xl font-bold sm:text-3xl">Financial Integrity & Adoption Gate</h1>
            <p className="mt-1 max-w-4xl text-sm text-tv-muted">Menguji dampak candidate macro inputs dan kematangan bank-specific evidence tanpa mengubah LensScore atau parameter valuation production secara otomatis.</p>
          </div>
        </div>

        <div className="mb-7 rounded-xl border border-tv-green/25 bg-tv-green/5 p-4 text-sm">
          <div className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-tv-green"/><div><p className="font-semibold">No auto-adoption</p><p className="mt-1 text-tv-muted">Halaman ini hanya read-only research gate. Evidence yang tersedia tidak pernah mengubah fair value, LensScore, atau sinyal sampai ada model-version dan validation protocol yang eksplisit.</p></div></div>
        </div>

        <section className="mb-10">
          <div className="mb-4 flex items-center gap-2"><Waves className="h-5 w-5 text-tv-blue"/><h2 className="font-heading text-xl font-bold">Macro Candidate Impact</h2></div>
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <Card as="div" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-4"><p className="text-xs text-tv-muted">Risk-free</p><p className="mt-1 font-number text-xl font-bold">{pct(macro.production.riskFreeRatePct)} → {pct(macro.candidate.riskFreeRatePct)}</p></Card>
            <Card as="div" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-4"><p className="text-xs text-tv-muted">ERP</p><p className="mt-1 font-number text-xl font-bold">{pct(macro.production.equityRiskPremiumPct)} → {pct(macro.candidate.equityRiskPremiumPct)}</p></Card>
            <Card as="div" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-4"><p className="text-xs text-tv-muted">Perpetual growth cap</p><p className="mt-1 font-number text-xl font-bold">{pct(macro.production.maxPerpetualGrowthPct)} → {pct(macro.candidate.maxPerpetualGrowthPct)}</p></Card>
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className={`rounded border px-2 py-1 text-[11px] font-bold ${statusClass(macro.status)}`}>{macro.status}</span>
            <span className="text-xs text-tv-muted">Largest |Δ cost of equity|: <span className="font-number text-tv-text">{macro.diagnostics.largestAbsoluteCostOfEquityDeltaPp == null ? '—' : `${macro.diagnostics.largestAbsoluteCostOfEquityDeltaPp.toFixed(2)} pp`}</span></span>
          </div>
          <Card as="div" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="overflow-x-auto border-tv-border">
            <table className="min-w-full text-sm"><thead className="border-b border-tv-border text-left text-xs text-tv-muted"><tr><th className="p-3">Beta</th><th className="p-3">Cost of equity production</th><th className="p-3">Cost of equity candidate</th><th className="p-3">Δ pp</th></tr></thead><tbody>{macro.scenarios.map((row)=><tr key={row.beta} className="border-b border-tv-border/60 last:border-0"><td className="p-3 font-number">{row.beta.toFixed(2)}</td><td className="p-3 font-number">{pct(row.productionPct)}</td><td className="p-3 font-number">{pct(row.evidencePct)}</td><td className="p-3 font-number">{row.deltaPp == null ? '—' : `${row.deltaPp >= 0 ? '+' : ''}${row.deltaPp.toFixed(2)} pp`}</td></tr>)}</tbody></table>
          </Card>
          <Card as="div" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="mt-3 border-tv-border p-4 text-sm text-tv-muted">
            {macro.reasons.map((reason)=><p key={reason} className="mb-1 last:mb-0">• {reason}</p>)}
          </Card>
        </section>

        <section>
          <div className="mb-4 flex items-center gap-2"><Building2 className="h-5 w-5 text-tv-blue"/><h2 className="font-heading text-xl font-bold">Bank Evidence Maturity</h2></div>
          <div className="mb-4 rounded-xl border border-tv-yellow/25 bg-tv-yellow/5 p-4 text-sm">
            <div className="flex gap-2"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-tv-yellow"/><div><p className="font-semibold">Scoring tetap OFF</p><p className="mt-1 text-tv-muted">{bank.guardrail}</p></div></div>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card as="div" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-4"><p className="text-xs text-tv-muted">Ticker</p><p className="mt-1 font-number text-2xl font-bold">{bank.tickerCount}</p></Card>
            <Card as="div" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-4"><p className="text-xs text-tv-muted">Evidence rows</p><p className="mt-1 font-number text-2xl font-bold">{bank.evidenceRows}</p></Card>
            <Card as="div" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-4"><p className="text-xs text-tv-muted">Research-analyzable</p><p className="mt-1 font-number text-2xl font-bold">{bank.tickers.filter((row)=>row.researchAnalyzable).length}</p></Card>
            <Card as="div" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="border-tv-border p-4"><p className="text-xs text-tv-muted">Scoring enabled</p><p className="mt-1 font-number text-2xl font-bold">0</p></Card>
          </div>
          <Card as="div" padding="none" radius="xl" elevation="none" overflow="visible" highlight={false} className="overflow-x-auto border-tv-border">
            <table className="min-w-full text-sm"><thead className="border-b border-tv-border text-left text-xs text-tv-muted"><tr><th className="p-3">Ticker</th><th className="p-3">Periods</th><th className="p-3">Metrics</th><th className="p-3">Research metrics</th><th className="p-3">Complete periods</th><th className="p-3">PIT violations</th><th className="p-3">Basis unspecified</th><th className="p-3">Research</th><th className="p-3">Scoring</th></tr></thead><tbody>{bank.tickers.map((row)=><tr key={row.ticker} className="border-b border-tv-border/60 last:border-0"><td className="p-3 font-semibold">{row.ticker}</td><td className="p-3 font-number">{row.periods}</td><td className="p-3 font-number">{row.distinctMetrics}/10</td><td className="p-3 font-number">{row.researchMetricsPresent}/6</td><td className="p-3 font-number">{row.completeResearchPeriods}</td><td className="p-3 font-number">{row.pitViolationRows}</td><td className="p-3 font-number">{row.unspecifiedBasisRows}</td><td className="p-3 text-xs">{row.researchAnalyzable ? 'ANALYZABLE' : 'WAIT'}</td><td className="p-3 text-xs">DATA_ONLY</td></tr>)}</tbody></table>
            {bank.tickers.length===0 && <p className="p-5 text-sm text-tv-muted">Belum ada bank metric evidence untuk dianalisis.</p>}
          </Card>
        </section>
      </div>
    </div>
  );
}
