import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Database, ShieldAlert, TrendingUp } from 'lucide-react';
import { isAdminServer } from '@/modules/user';
import { getOwnershipFlowValidationDashboard } from '@/modules/ownership-flow/service/ownership-flow-validation.service';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

function pp(v: number | null) { return v == null ? '—' : `${v.toFixed(4)} pp`; }
function date(v: string | null) { return v ? new Date(`${v}T00:00:00Z`).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric', timeZone:'UTC' }) : '—'; }

export default async function OwnershipFlowValidationPage() {
  if (!(await isAdminServer())) redirect('/admin-login');
  const d = await getOwnershipFlowValidationDashboard();
  const pitBlocked = d.predictiveValidationStatus === 'NOT_PIT_ELIGIBLE';
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 text-sm text-tv-muted hover:text-tv-text"><ArrowLeft className="h-4 w-4"/>Kembali ke Admin</Link>
      <h1 className="font-heading text-2xl font-bold text-tv-text">Ownership Flow Validation Lab</h1>
      <p className="mt-1 text-sm text-tv-muted">Audit distribusi perubahan kepemilikan KSEI. Research-only; tidak mengubah LensScore atau label production.</p>

      <section className={`mt-5 rounded-xl border p-4 ${pitBlocked ? 'border-tv-yellow/25 bg-tv-yellow/[0.04]' : 'border-tv-green/25 bg-tv-green/[0.04]'}`}>
        <div className="flex gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 text-tv-yellow"/><div>
          <p className="font-bold text-tv-text">Predictive validation: {d.predictiveValidationStatus}</p>
          <p className="mt-1 text-sm leading-relaxed text-tv-muted">{pitBlocked ? `Histori mengandung ${d.backfilledRows.toLocaleString('id-ID')} row backfill dan baru ${d.pitEligibleSnapshots}/${d.minPitSnapshotsForPredictiveStudy} snapshot PIT. Backfill tetap boleh untuk deskripsi posisi, tetapi wajib dikeluarkan dari studi prediktif agar tidak terjadi look-ahead bias.` : 'Provenance snapshot memenuhi gate PIT awal; forward-return study tetap harus dijalankan dan dipisahkan OOS.'}</p>
        </div></div>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Snapshot" value={String(d.snapshots)} sub={`${date(d.firstObservedDate)} → ${date(d.lastObservedDate)}`}/>
        <Card label="Rows" value={d.rows.toLocaleString('id-ID')} sub={`${d.comparableChanges.toLocaleString('id-ID')} perubahan comparable`}/>
        <Card label="PIT eligible" value={`${d.pitEligibleSnapshots}/${d.minPitSnapshotsForPredictiveStudy} snapshot`} sub={`${d.pitEligibleRows.toLocaleString('id-ID')} row · lag ≤ ${d.maxPublicationLagDaysAllowed} hari`}/>
        <Card label="Threshold research" value={d.thresholdResearchStatus} sub="tidak mengaktifkan label otomatis"/>
      </div>

      <section className="mt-4 rounded-xl border border-tv-border bg-tv-card p-4">
        <h2 className="flex items-center gap-2 font-heading font-bold text-tv-text"><TrendingUp className="h-4 w-4 text-tv-blue"/>Distribusi |Δ Foreign| per snapshot</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card label="P50" value={pp(d.absoluteDeltaPercentilesPp.p50)}/><Card label="P75" value={pp(d.absoluteDeltaPercentilesPp.p75)}/><Card label="P90" value={pp(d.absoluteDeltaPercentilesPp.p90)}/><Card label="P95" value={pp(d.absoluteDeltaPercentilesPp.p95)}/>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
          <div className="rounded-lg border border-tv-border p-3"><div className="text-tv-green font-bold">{d.positiveChanges.toLocaleString('id-ID')}</div><div className="text-tv-muted">naik</div></div>
          <div className="rounded-lg border border-tv-border p-3"><div className="text-tv-red font-bold">{d.negativeChanges.toLocaleString('id-ID')}</div><div className="text-tv-muted">turun</div></div>
          <div className="rounded-lg border border-tv-border p-3"><div className="text-tv-text font-bold">{d.unchangedChanges.toLocaleString('id-ID')}</div><div className="text-tv-muted">tetap</div></div>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-tv-border bg-tv-card p-4">
        <h2 className="flex items-center gap-2 font-heading font-bold text-tv-text"><Database className="h-4 w-4 text-tv-blue"/>Guardrail integritas</h2>
        <ul className="mt-3 space-y-2 text-sm text-tv-muted">{d.guardrails.map((g) => <li key={g} className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-2.5">• {g}</li>)}</ul>
      </section>
    </main>
  );
}
function Card({label,value,sub}:{label:string;value:string;sub?:string}){return <div className="rounded-xl border border-tv-border bg-tv-card p-3.5"><p className="text-[10.5px] uppercase tracking-wide text-tv-muted">{label}</p><p className="mt-1 break-words font-heading text-sm font-bold text-tv-text">{value}</p>{sub&&<p className="mt-1 text-[11px] text-tv-muted">{sub}</p>}</div>}
