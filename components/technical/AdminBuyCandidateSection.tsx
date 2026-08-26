import { isAdminServer } from '@/modules/user/service/admin.service';
import { getLatestDecisionSignalForTicker } from '@/modules/decision-agent';
import type { PersistedDecisionSignal } from '@/modules/decision-agent';
import { AdminBuyCandidateDetailPanel } from './AdminBuyCandidateDetailPanel';

async function fetchAdminCandidateSignal(symbol: string): Promise<PersistedDecisionSignal | null> {
  const isAdmin = await isAdminServer();
  if (!isAdmin) return null;
  try {
    return await getLatestDecisionSignalForTicker(symbol);
  } catch (error) {
    console.error('AdminBuyCandidateSection error:', error);
    return null;
  }
}

export async function AdminBuyCandidateSection({ symbol }: { symbol: string }) {
  const signal = await fetchAdminCandidateSignal(symbol);
  if (!signal) return null;

  return (
    <section className="my-6">
      <AdminBuyCandidateDetailPanel signal={signal} />
    </section>
  );
}
