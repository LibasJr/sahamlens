import { Pool, types, type QueryResult, type QueryResultRow } from 'pg';
import { getNodeEnv } from '../config/env';

// PostgreSQL DATE harus tetap YYYY-MM-DD string.
// Mencegah pergeseran tanggal karena timezone.
types.setTypeParser(1082, (value: string) => value);

// Reused across hot reloads in dev and across warm serverless invocations in prod,
// so we don't open a fresh pool (and hit Neon's connection limit) on every request.
const globalForPg = globalThis as unknown as {
  __sahamlensPgPool?: Pool;
  __sahamlensPgPoolErrorHandlerInstalled?: boolean;
};

function isTransientPgError(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null;
  const code = String(err?.code ?? '').toUpperCase();
  const message = String(err?.message ?? '').toLowerCase();

  return (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE' ||
    code === '57P01' ||
    code === '57P02' ||
    code === '57P03' ||
    code === '08000' ||
    code === '08003' ||
    code === '08006' ||
    message.includes('connection terminated unexpectedly') ||
    message.includes('connection terminated') ||
    message.includes('connection reset') ||
    message.includes('socket hang up') ||
    message.includes('server closed the connection unexpectedly')
  );
}

function installPoolErrorHandler(pool: Pool): void {
  if (globalForPg.__sahamlensPgPoolErrorHandlerInstalled) return;

  // pg.Pool may emit "error" from an idle client when DB/network closes a socket.
  // Without a listener, Node treats EventEmitter "error" as an uncaught exception.
  pool.on('error', (error) => {
    console.error('[postgres.pool] idle client error', {
      name: error?.name,
      message: error?.message,
      code: (error as { code?: string })?.code,
    });
  });

  globalForPg.__sahamlensPgPoolErrorHandlerInstalled = true;
}

// Pool dibuat saat PERTAMA DIPAKAI, bukan saat modul diimpor.
function getPool(): Pool {
  if (!globalForPg.__sahamlensPgPool) {
    // Preserve strict TLS + URL normalization from the latest Round 4 source.
    const databaseUrl = getNodeEnv().DATABASE_URL.replace(
      /([?&])sslmode=(?:prefer|require|verify-ca)(?=(&|$))/i,
      '$1sslmode=verify-full'
    );

    const pgPool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: true },
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // Rotate long-lived warm-serverless connections after they return idle.
      maxLifetimeSeconds: 300,
    });

    installPoolErrorHandler(pgPool);
    globalForPg.__sahamlensPgPool = pgPool;
  }
  return globalForPg.__sahamlensPgPool;
}

// Proxy supaya call site tetap menulis `pool.query(...)` / `pool.connect()` seperti sebelumnya.
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const real = getPool();
    const value = Reflect.get(real, prop, real);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

/**
 * Retry SATU KALI untuk SELECT/read-only query yang gagal karena koneksi transient.
 * Jangan gunakan untuk INSERT/UPDATE/DELETE atau transaksi.
 */
export async function queryReadWithRetry<R extends QueryResultRow = any>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<R>> {
  try {
    return await getPool().query<R>(text, params);
  } catch (error) {
    if (!isTransientPgError(error)) throw error;

    console.warn('[postgres.read-retry] transient connection error; retrying once', {
      message: error instanceof Error ? error.message : String(error),
      code: (error as { code?: string } | null)?.code,
    });

    await new Promise((resolve) => setTimeout(resolve, 75));
    return getPool().query<R>(text, params);
  }
}

export { isTransientPgError };
