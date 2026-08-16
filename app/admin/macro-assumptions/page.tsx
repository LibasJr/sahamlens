import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, ExternalLink, ShieldCheck, TriangleAlert, Waves } from 'lucide-react';
import { isAdminServer } from '@/modules/user';
import { getValuationMacroAuditStatus } from '@/modules/macro/service/valuation-assumption.service';
import type { MacroInputEvidence } from '@/modules/macro/repository/valuation-assumption.repository';

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

function pct(value: number | null | undefined) {
  return value == null ? '—' : `${value.toFixed(2)}%`;
}

function evidenceCard(title: string, evidence: MacroInputEvidence | null, production?: number) {
  const differs = evidence != null && production != null && Math.abs(evidence.valuePct - production) > 1e-9;
  return (
    <div className="rounded-xl border border-tv-border bg-tv-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-tv-muted">{title}</p>
          <p className="mt-2 font-number text-2xl font-bold text-tv-text">{pct(evidence?.valuePct)}</p>
        </div>
        {evidence ? (
          <span className="rounded border border-tv-green/30 bg-tv-green/10 px-2 py-1 text-[10px] font-bold text-tv-green">PIT EVIDENCE</span>
        ) : (
          <span className="rounded border border-tv-yellow/30 bg-tv-yellow/10 px-2 py-1 text-[10px] font-bold text-tv-yellow">BELUM ADA</span>
        )}
      </div>
      {production != null && (
        <p className="mt-2 text-xs text-tv-muted">Production frozen: <span className="font-number text-tv-text">{pct(production)}</span>{differs ? ' · berbeda dari evidence' : ' · sama'}</p>
      )}
      {evidence && (
        <div className="mt-4 space-y-1.5 text-xs text-tv-muted">
          <p>Market date: <span className="font-number text-tv-text">{evidence.marketDate ?? 'N/A (model policy)'}</span></p>
          <p>Observed: <span className="font-number text-tv-text">{evidence.observedDate}</span></p>
          <p>Usable from: <span className="font-number text-tv-text">{evidence.usableFromDate}</span></p>
          <p>Type: <span className="text-tv-text">{evidence.evidenceType}</span></p>
          <p>Tier: <span className="text-tv-text">{evidence.sourceTier}</span></p>
          <p className="pt-1 text-tv-text">{evidence.sourceName}</p>
          <p>{evidence.methodology}</p>
          {evidence.sourceUrl && (
            <a className="inline-flex items-center gap-1 text-tv-blue hover:underline" href={evidence.sourceUrl} target="_blank" rel="noreferrer">
              Buka sumber <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default async function MacroAssumptionsAdminPage() {
  if (!(await isAdminServer())) redirect('/admin-login');
  const status = await getValuationMacroAuditStatus();

  return (
    <div className="min-h-screen bg-tv-bg p-4 text-tv-text sm:p-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin" className="mb-5 inline-flex items-center gap-1.5 text-sm text-tv-muted hover:text-tv-text">
          <ArrowLeft className="h-4 w-4" /> Kembali ke Admin
        </Link>
        <div className="mb-7 flex items-start gap-3">
          <div className="rounded-xl bg-tv-blue/10 p-2.5 text-tv-blue"><Waves className="h-6 w-6" /></div>
          <div>
            <h1 className="font-heading text-2xl font-bold sm:text-3xl">Macro PIT & Valuation Inputs</h1>
            <p className="mt-1 max-w-3xl text-sm text-tv-muted">Audit provenance risk-free, ERP, policy rate, dan inflation target. Evidence di halaman ini tidak otomatis mengubah model production.</p>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-tv-green/25 bg-tv-green/5 p-4 text-sm">
          <div className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-tv-green" /><div><p className="font-semibold">Production tetap FROZEN_BY_MODEL_VERSION</p><p className="mt-1 text-tv-muted">Import evidence hanya menambah jejak audit point-in-time. Adopsi parameter baru wajib model-version, regression/golden test, dan validasi ulang.</p></div></div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {evidenceCard('Risk-free proxy (SBN 10Y)', status.evidence.riskFree, status.productionModel.riskFreeRatePct)}
          {evidenceCard('Indonesia Equity Risk Premium', status.evidence.erp, status.productionModel.equityRiskPremiumPct)}
          {evidenceCard('Perpetual Growth Cap', status.evidence.growthCap, status.productionModel.maxPerpetualGrowthPct)}
        </div>

        <h2 className="mb-3 mt-8 font-heading text-lg font-bold">Konteks Makro — tidak dipakai sebagai substitusi CAPM</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {evidenceCard('BI-Rate', status.macroContext.biRate)}
          {evidenceCard('Inflation Target Mid', status.macroContext.inflationMid)}
          {evidenceCard('Inflation Target Upper', status.macroContext.inflationUpper)}
        </div>

        <div className="mt-7 rounded-xl border border-tv-yellow/25 bg-tv-yellow/5 p-4 text-sm">
          <div className="flex gap-2"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-tv-yellow" /><div><p className="font-semibold">Status adopsi: {status.adoptionStatus}</p><p className="mt-1 text-tv-muted">{status.guardrail}</p></div></div>
        </div>
      </div>
    </div>
  );
}
