import type { SessionPayload } from './jwt';

export interface EntitlementOptions {
  testingOpen: boolean;
  nowMs?: number;
}

function activeAfter(value: string | null | undefined, nowMs: number): boolean {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time > nowMs;
}

/** Pure policy used by runtime and regression tests. No DB/network side effects. */
export function evaluateEntitlement(session: SessionPayload | null, options: EntitlementOptions): boolean {
  if (!session) return false;
  if (options.testingOpen) return true;
  if (session.role === 'admin') return true;
  const nowMs = options.nowMs ?? Date.now();
  if (session.is_pro === true && activeAfter(session.pro_expires_at, nowMs)) return true;
  if (activeAfter(session.trial_ends_at, nowMs)) return true;
  return false;
}
