import { cacheGet, cacheSet } from '@/shared/cache/redis-cache';
import { recordProviderOutcome } from '@/shared/observability/request-context';

type CircuitState = {
  failures: number;
  openedAt: number | null;
  lastFailureAt: number | null;
};

const memory = new Map<string, CircuitState>();

function stateKey(provider: string): string {
  return `sahamlens:circuit:v1:${provider}`;
}

function getThreshold(): number {
  const parsed = Number(process.env.PROVIDER_CIRCUIT_FAILURE_THRESHOLD ?? 5);
  return Number.isFinite(parsed) && parsed >= 2 ? Math.floor(parsed) : 5;
}

function getOpenMs(): number {
  const sec = Number(process.env.PROVIDER_CIRCUIT_OPEN_SEC ?? 900);
  return (Number.isFinite(sec) && sec >= 60 ? sec : 900) * 1000;
}

async function read(provider: string): Promise<CircuitState> {
  const key = stateKey(provider);
  const cached = await cacheGet<CircuitState>(key);
  if (cached && typeof cached.failures === 'number') return cached;
  return memory.get(key) ?? { failures: 0, openedAt: null, lastFailureAt: null };
}

async function write(provider: string, value: CircuitState): Promise<void> {
  const key = stateKey(provider);
  memory.set(key, value);
  await cacheSet(key, value, Math.max(3600, Math.ceil(getOpenMs() / 1000) * 4));
}

/**
 * Provider-level circuit breaker. The goal is not to hide outages, but to stop one
 * provider outage from causing hundreds of repeated outbound requests and making an
 * external block worse. Redis makes the state shared across application processes;
 * the in-memory copy is only a fallback when Redis is unavailable.
 */
export async function isProviderCircuitOpen(provider: string): Promise<boolean> {
  const value = await read(provider);
  if (value.openedAt == null) return false;
  if (Date.now() - value.openedAt < getOpenMs()) {
    recordProviderOutcome(provider, 'circuit-open');
    return true;
  }
  await write(provider, { failures: 0, openedAt: null, lastFailureAt: value.lastFailureAt });
  recordProviderOutcome(provider, 'circuit-reset');
  return false;
}

export async function recordProviderSuccess(provider: string): Promise<void> {
  await write(provider, { failures: 0, openedAt: null, lastFailureAt: null });
  recordProviderOutcome(provider, 'success');
}

export async function recordProviderFailure(provider: string, options?: { immediateOpen?: boolean }): Promise<void> {
  const previous = await read(provider);
  const failures = previous.failures + 1;
  const shouldOpen = Boolean(options?.immediateOpen) || failures >= getThreshold();
  await write(provider, {
    failures,
    openedAt: shouldOpen ? (previous.openedAt ?? Date.now()) : null,
    lastFailureAt: Date.now(),
  });
  recordProviderOutcome(provider, 'failure');
}

export async function getProviderCircuitState(provider: string): Promise<CircuitState & { open: boolean }> {
  const state = await read(provider);
  return { ...state, open: await isProviderCircuitOpen(provider) };
}
