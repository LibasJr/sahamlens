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
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">AI Decision Lab</h1>
        <p className="mt-2 max-w-4xl text-sm text-tv-muted">
          Shadow decision dan paper execution berbasis snapshot SahamLens yang benar-benar tersedia. Data kurang atau kedaluwarsa menghasilkan NO_SIGNAL; live broker tetap terkunci.
        </p>
        <DecisionLabClient initialDashboard={initialDashboard} />
      </div>
    </main>
  );
}
