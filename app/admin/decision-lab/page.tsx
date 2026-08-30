import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { isAdminServer } from '@/modules/user';
import { getDecisionAgentDashboard } from '@/modules/decision-agent';
import DecisionLabClient from './DecisionLabClient';

export const metadata = { robots: { index: false, follow: false } };

export default async function DecisionLabPage() {
  if (!(await isAdminServer())) redirect('/admin-login');
  const initialDashboard = await getDecisionAgentDashboard();

  return (
    <main className="min-h-screen bg-tv-bg p-4 text-tv-text sm:p-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 text-sm text-tv-muted hover:text-tv-text">
          <ArrowLeft className="h-4 w-4" /> Kembali ke Admin
        </Link>
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">Simulasi Keputusan AI</h1>
        <p className="mt-2 max-w-4xl text-sm text-tv-muted">
          Simulasi keputusan dan paper execution berbasis snapshot SahamLens yang benar-benar tersedia. Data kurang atau kedaluwarsa menghasilkan NO_SIGNAL; live broker tetap terkunci.
        </p>
        <div className="mt-4 rounded-2xl border border-tv-border bg-tv-card p-4 text-sm text-tv-muted">
          <div className="font-semibold text-tv-text">Diagram 3 lapis</div>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-tv-green/30 bg-tv-green/10 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-tv-muted">1. Otomatis</div>
              <div className="mt-2 font-semibold text-tv-text">Scan & status blokir</div>
              <ul className="mt-2 space-y-1 text-sm">
                <li>• Ambil data real</li>
                <li>• Hitung LensScore</li>
                <li>• Tentukan BUY/WATCH/HOLD/EXIT/NO_SIGNAL</li>
                <li>• Tandai blokir: stale, data quality, model, broker</li>
              </ul>
            </div>
            <div className="rounded-xl border border-tv-blue/30 bg-tv-blue/10 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-tv-muted">2. Tampilan role</div>
              <div className="mt-2 font-semibold text-tv-text">Penjelasan pembagian kerja</div>
              <ul className="mt-2 space-y-1 text-sm">
                <li>• Lead, Analyst, Reviewer</li>
                <li>• Security, Frontend, Ops, Research</li>
                <li>• Hanya untuk memudahkan baca alur</li>
                <li>• Bukan 7 model AI independen</li>
              </ul>
            </div>
            <div className="rounded-xl border border-tv-yellow/30 bg-tv-yellow/10 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-tv-muted">3. AI backend</div>
              <div className="mt-2 font-semibold text-tv-text">Decision Engine + Hybrid Analyst</div>
              <ul className="mt-2 space-y-1 text-sm">
                <li>• Hybrid review hanya untuk kandidat yang lolos</li>
                <li>• Model fallback dicoba berurutan</li>
                <li>• Verdict: CONFIRM / CHALLENGE / INSUFFICIENT</li>
                <li>• Output tetap berbasis evidence real</li>
              </ul>
            </div>
          </div>
          <div className="mt-4 text-xs text-tv-muted">
            Detail struktur role tersedia di <a className="text-tv-blue hover:underline" href="/docs/admin/decision-lab-role-stack">dokumen stack role</a>.
          </div>
        </div>
        <DecisionLabClient initialDashboard={initialDashboard} />
      </div>
    </main>
  );
}
