import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestUserClass = 'unknown' | 'anonymous' | 'free' | 'pro' | 'admin';
export type ProviderOutcome = 'success' | 'failure' | 'circuit-open' | 'circuit-reset';

interface RequestObservabilityState {
  requestId: string;
  route?: string;
  method?: string;
  userClass: RequestUserClass;
  cacheStates: Set<string>;
  providerEvents: Set<string>;
  degradedReasons: Set<string>;
}

const globalState = globalThis as unknown as {
  __sahamlensRequestObservability?: AsyncLocalStorage<RequestObservabilityState>;
};

const storage = globalState.__sahamlensRequestObservability ??=
  new AsyncLocalStorage<RequestObservabilityState>();

export function runWithRequestObservability<T>(
  input: { requestId: string; route?: string; method?: string },
  callback: () => T,
): T {
  return storage.run({
    ...input,
    userClass: 'unknown',
    cacheStates: new Set(),
    providerEvents: new Set(),
    degradedReasons: new Set(),
  }, callback);
}

export function setRequestUserClass(userClass: RequestUserClass): void {
  const state = storage.getStore();
  if (state) state.userClass = userClass;
}

export function recordCacheState(cacheState: string, degradedReason?: string): void {
  const state = storage.getStore();
  if (!state) return;
  state.cacheStates.add(cacheState);
  if (degradedReason) state.degradedReasons.add(degradedReason);
}

export function recordProviderOutcome(provider: string, outcome: ProviderOutcome): void {
  const state = storage.getStore();
  if (!state) return;
  state.providerEvents.add(`${provider}:${outcome}`);
}

export function recordDegradedMode(reason: string): void {
  storage.getStore()?.degradedReasons.add(reason);
}

/** Snapshot serializable untuk logger/Sentry; tidak pernah memuat IP, cookie, atau user ID. */
export function currentRequestLogContext(): Record<string, unknown> {
  const state = storage.getStore();
  if (!state) return {};
  return {
    requestId: state.requestId,
    route: state.route,
    method: state.method,
    userClass: state.userClass,
    cacheState: Array.from(state.cacheStates),
    provider: Array.from(state.providerEvents),
    degraded: state.degradedReasons.size > 0,
    degradedReason: Array.from(state.degradedReasons),
  };
}
