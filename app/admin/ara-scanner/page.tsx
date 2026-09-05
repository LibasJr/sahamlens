import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleDashed, ShieldAlert } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { ARA_SCANNER_POLICY, getAraScannerReadiness, type AraScannerInputStatus } from '@/modules/ara-scanner';
import { isAdminServer } from '@/modules/user';

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const INPUT_STATUS: Record<AraScannerInputStatus, { label: string; tone: string }> = {
  READY: { label: 'Siap', tone: 'border-tv-green/30 bg-tv-green/10 text-tv-green' },
  PARTIAL: { label: 'Parsial', tone: 'border-tv-yellow/30 bg-tv-yellow/10 text-tv-yellow' },
  MISSING: { label: 'Belum ada', tone: 'border-tv-red/30 bg-tv-red/10 text-tv-red' },
  STALE: { label: 'Kedaluwarsa', tone: 'border-tv-yellow/30 bg-tv-yellow/10 text-tv-yellow' },
  ERROR: { label: 'Error', tone: 'border-tv-red/30 bg-tv-red/10 text-tv-red' },
  OUT_OF_SCOPE: { label: 'Di luar cakupan', tone: 'border-tv-border bg-tv-bg text-tv-muted' },
};

export default async function AdminAraScannerPage() {
  if (!(await isAdminServer())) redirect('/admin-login');

  const readiness = getAraScannerReadiness();

  return (
    <main className="min-h-screen bg-tv-bg p-4 text-tv-text sm:p-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 text-sm text-tv-muted hover:text-tv-text">
          <ArrowLeft className="h-4 w-4" /> Kembali ke Admin
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold sm:text-3xl">Kesiapan Scanner ARA</h1>
            <p className="mt-2 max-w-3xl text-sm text-tv-muted">
              Pemeriksaan internal jalur data yang wajib tersedia sebelum scanner ARA boleh dijalankan.
              Panel ini tidak menerbitkan rekomendasi atau sinyal ke pengguna.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-tv-red/30 bg-tv-red/10 px-3 py-1.5 text-sm font-bold text-tv-red">
            <CircleDashed className="h-4 w-4" /> {readiness.status}
          </span>
        </div>

        <Card as="section" className="mt-6 border-tv-red/30" padding="lg" radius="xl" elevation="none" highlight={false}>
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-tv-red" />
            <div>
              <h2 className="font-heading text-lg font-bold">Fail-closed aktif</h2>
              <p className="mt-1 text-sm text-tv-muted">{readiness.reason}</p>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-tv-muted">
                <span>Input terblokir: <b className="text-tv-text">{readiness.blockerCount}/{readiness.inputs.length}</b></span>
                <span>Di luar cakupan: <b className="text-tv-text">{readiness.outOfScopeInputs.length}</b></span>
                <span>Siap: <b className="text-tv-text">{readiness.inputs.filter((i) => i.status === 'READY').length}/{readiness.inputs.length}</b></span>
                <span>Sinyal dibuat: <b className="text-tv-text">{readiness.signalCount}</b></span>
                <span>Versi gate: <b className="font-number text-tv-text">{readiness.gateVersion}</b></span>
              </div>
            </div>
          </div>
        </Card>

        <Card as="section" className="mt-4 border-tv-yellow/30" padding="lg" radius="xl" elevation="none" highlight={false}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-tv-yellow" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-lg font-bold">Kesetaraan algoritma Hermes</h2>
                <span className="rounded-full border border-tv-yellow/30 bg-tv-yellow/10 px-2 py-0.5 text-[11px] font-bold text-tv-yellow">
                  {readiness.engineParity.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-tv-muted">{readiness.engineParity.detail}</p>
            </div>
          </div>
        </Card>

        <Card as="section" className="mt-4 border-tv-border" padding="lg" radius="xl" elevation="none" highlight={false}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-bold">{ARA_SCANNER_POLICY.name} {ARA_SCANNER_POLICY.version}</h2>
              <p className="mt-1 text-sm text-tv-muted">ACS bukan probabilitas dan tidak boleh menghasilkan BUY otomatis.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {ARA_SCANNER_POLICY.lifecycle.map((stage) => (
                <span key={stage} className="rounded-full border border-tv-yellow/30 bg-tv-yellow/10 px-2 py-0.5 text-[10px] font-bold text-tv-yellow">
                  {stage}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-tv-border bg-tv-bg p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-tv-muted">Formula mesin bukti SahamLens</div>
            <code className="mt-2 block overflow-x-auto whitespace-nowrap font-number text-sm text-tv-text">
              {ARA_SCANNER_POLICY.formula.expressionAsProvided}
            </code>
            <p className="mt-3 text-xs leading-5 text-tv-yellow">{ARA_SCANNER_POLICY.formula.reviewNote}</p>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="font-heading font-bold">Komponen ACS</h3>
              <div className="mt-3 space-y-3">
                {ARA_SCANNER_POLICY.formula.components.map((component) => (
                  <div key={component.key} className="grid grid-cols-[36px_50px_1fr] gap-2 text-sm">
                    <b className="font-number text-tv-text">{component.key}</b>
                    <span className="font-number text-tv-muted">{Math.round(component.weight * 100)}%</span>
                    <span className="text-tv-muted"><b className="text-tv-text">{component.label}</b> - {component.detail}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-heading font-bold">Gerbang data v0.3</h3>
              <ul className="mt-3 space-y-2 text-sm text-tv-muted">
                <li>Timestamp valid, tidak stale, dan maksimal {ARA_SCANNER_POLICY.dataGate.maxFutureSkewMinutes} menit di masa depan.</li>
                <li>Minimal {Math.round(ARA_SCANNER_POLICY.dataGate.minimumAvailableWeight * 100)}% bobot komponen tersedia; komponen hilang bernilai nol dan tetap dilaporkan, tanpa menaikkan skor lewat normalisasi ulang.</li>
                <li>Harga sudah disesuaikan terhadap aksi korporasi.</li>
                <li>Saham dapat diperdagangkan dan tidak terkena suspensi/kendala.</li>
                <li>Sumber dan waktu data dapat ditelusuri.</li>
                <li>Jika gagal: ACS null dan NO ACTION.</li>
              </ul>
              <h3 className="mt-5 font-heading font-bold">Interpretasi awal</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {ARA_SCANNER_POLICY.thresholds.map((threshold) => (
                  <div key={threshold.label} className="rounded-lg border border-tv-border bg-tv-bg px-3 py-2">
                    <b className="text-tv-text">{threshold.label}</b>
                    <span className="ml-2 font-number text-tv-muted">{threshold.min}-{threshold.max}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {readiness.inputs.map((input) => {
            const status = INPUT_STATUS[input.status];
            return (
              <Card key={input.key} as="section" padding="lg" radius="xl" elevation="none" highlight={false} className="border-tv-border">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    {input.status === 'READY'
                      ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-tv-green" />
                      : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-tv-yellow" />}
                    <h2 className="font-heading font-bold text-tv-text">{input.label}</h2>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${status.tone}`}>
                    {status.label}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-tv-muted">{input.detail}</p>
                <div className="mt-3 border-t border-tv-border pt-3 text-xs text-tv-muted">
                  Sumber saat ini: <span className="text-tv-text">{input.source ?? 'Belum terhubung'}</span>
                </div>
              </Card>
            );
          })}
        </div>

        <Card as="section" className="mt-6 border-tv-border" padding="lg" radius="xl" elevation="none" highlight={false}>
          <h2 className="font-heading text-lg font-bold">Syarat sebelum diaktifkan</h2>
          <p className="mt-2 text-sm leading-6 text-tv-muted">
            Seluruh delapan input harus berstatus Siap pada snapshot yang sama, memiliki timestamp dan provenance,
            lalu lolos pemeriksaan kualitas. Status Parsial tidak dihitung sebagai siap. Sampai itu terpenuhi,
            Agent Speed tidak boleh menerima keluaran ARA.
          </p>
        </Card>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card as="section" className="border-tv-border" padding="lg" radius="xl" elevation="none" highlight={false}>
            <h2 className="font-heading text-lg font-bold">Kontrak ke Agent Speed</h2>
            <p className="mt-2 text-sm text-tv-yellow">SahamLens hanya mengirim bukti non-binding. Agent Speed wajib menilai independen.</p>
            <ol className="mt-3 space-y-2 text-sm text-tv-muted">
              {ARA_SCANNER_POLICY.downstreamDecisionContract.gates.map((gate, index) => <li key={gate}>{index + 1}. {gate}</li>)}
            </ol>
            <p className="mt-4 text-sm text-tv-yellow">Bear/Risk Reviewer dapat memveto kandidat kapan saja; manusia tetap otoritas final.</p>
          </Card>
          <Card as="section" className="border-tv-border" padding="lg" radius="xl" elevation="none" highlight={false}>
            <h2 className="font-heading text-lg font-bold">Larangan tetap</h2>
            <ul className="mt-3 space-y-2 text-sm text-tv-muted">
              {ARA_SCANNER_POLICY.prohibitions.map((rule) => <li key={rule}>- {rule}</li>)}
            </ul>
            <p className="mt-4 text-xs text-tv-muted">Maksimum kandidat per keluaran: <b className="text-tv-text">{ARA_SCANNER_POLICY.maxCandidates}</b></p>
          </Card>
        </div>
      </div>
    </main>
  );
}
