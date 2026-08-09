export interface BoundedLoaderOptions {
  concurrency: number;
  ttlMs: number;
  timeoutMs: number;
  maxEntries?: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Generic bounded + memoized async loader.
 *
 * Properties:
 * - hard concurrency ceiling;
 * - in-flight de-duplication;
 * - short-lived success cache;
 * - failed requests are NEVER cached;
 * - timeout isolation per task;
 * - no dependency on Redis/database.
 *
 * Designed for warm serverless instances: cache is opportunistic only.
 */
export function createBoundedLoader<K, V>(
  load: (key: K) => Promise<V>,
  keyOf: (key: K) => string,
  options: BoundedLoaderOptions,
): {
  get: (key: K) => Promise<V>;
  clear: () => void;
  stats: () => {
    active: number;
    queued: number;
    cached: number;
    inFlight: number;
    concurrency: number;
  };
} {
  const concurrency = Math.max(1, Math.floor(options.concurrency));
  const ttlMs = Math.max(0, Math.floor(options.ttlMs));
  const timeoutMs = Math.max(0, Math.floor(options.timeoutMs));
  const maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 256));

  const cache = new Map<string, CacheEntry<V>>();
  const inFlight = new Map<string, Promise<V>>();

  let active = 0;
  const queue: Array<() => void> = [];

  function prune(now = Date.now()) {
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(key);
    }
    while (cache.size > maxEntries) {
      const first = cache.keys().next().value as string | undefined;
      if (!first) break;
      cache.delete(first);
    }
  }

  async function acquire(): Promise<void> {
    if (active < concurrency) {
      active++;
      return;
    }

    await new Promise<void>((resolve) => {
      queue.push(() => {
        active++;
        resolve();
      });
    });
  }

  function release(): void {
    active = Math.max(0, active - 1);
    const next = queue.shift();
    if (next) next();
  }

  async function run(key: K, normalizedKey: string): Promise<V> {
    await acquire();

    try {
      const value = await withTimeout(
        Promise.resolve().then(() => load(key)),
        timeoutMs,
        normalizedKey,
      );

      if (ttlMs > 0) {
        cache.set(normalizedKey, {
          value,
          expiresAt: Date.now() + ttlMs,
        });
        prune();
      }

      return value;
    } finally {
      release();
    }
  }

  async function get(key: K): Promise<V> {
    const normalizedKey = keyOf(key);
    const now = Date.now();

    const cached = cache.get(normalizedKey);
    if (cached) {
      if (cached.expiresAt > now) return cached.value;
      cache.delete(normalizedKey);
    }

    const existing = inFlight.get(normalizedKey);
    if (existing) return existing;

    const task = run(key, normalizedKey)
      .finally(() => {
        inFlight.delete(normalizedKey);
      });

    inFlight.set(normalizedKey, task);
    return task;
  }

  return {
    get,
    clear() {
      cache.clear();
      inFlight.clear();
    },
    stats() {
      prune();
      return {
        active,
        queued: queue.length,
        cached: cache.size,
        inFlight: inFlight.size,
        concurrency,
      };
    },
  };
}
