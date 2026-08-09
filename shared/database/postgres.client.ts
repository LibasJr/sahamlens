import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { getNodeEnv } from '../config/env';

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

  // PostgreSQL / network errors that are normally safe to retry for READ-ONLY queries.
  return (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE' ||
    code === '57P01' || // admin_shutdown
    code === '57P02' || // crash_shutdown
    code === '57P03' || // cannot_connect_now
    code === '08000' || // connection_exception
    code === '08003' || // connection_does_not_exist
    code === '08006' || // connection_failure
    message.includes('connection terminated unexpectedly') ||
    message.includes('connection terminated') ||
    message.includes('connection reset') ||
    message.includes('socket hang up') ||
    message.includes('server closed the connection unexpectedly')
  );
}

function installPoolErrorHandler(pool: Pool): void {
  if (globalForPg.__sahamlensPgPoolErrorHandlerInstalled) return;

  /**
   * WAJIB ada untuk pg.Pool.
   *
   * pg dapat emit "error" dari idle client ketika database/network memutus socket.
   * Tanpa listener, Node memperlakukan EventEmitter "error" sebagai uncaught exception
   * dan proses serverless dapat berakhir fatal.
   *
   * Handler ini TIDAK menyembunyikan kegagalan query aktif. Query aktif tetap reject
   * ke caller dan harus ditangani di route/service.
   */
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
    const pgPool = new Pool({
      connectionString: getNodeEnv().DATABASE_URL,
      ssl: { rejectUnauthorized: true },
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,

      // Serverless-friendly: client yang sudah lama hidup tidak dipertahankan selamanya.
      // Nilai ini tidak mematikan query aktif; client baru dirotasi setelah kembali idle.
      maxLifetimeSeconds: 300,
    });

    installPoolErrorHandler(pgPool);
    globalForPg.__sahamlensPgPool = pgPool;
  }

  return globalForPg.__sahamlensPgPool;
}

// Proxy supaya call site existing tetap menulis pool.query(...) / pool.connect().
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const real = getPool();
    const value = Reflect.get(real, prop, real);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

/**
 * Retry SATU KALI untuk SELECT/read-only query yang gagal karena koneksi transient.
 *
 * JANGAN gunakan helper ini untuk INSERT/UPDATE/DELETE atau transaksi, karena kita
 * tidak boleh mengambil risiko double-write bila server sebenarnya sudah mengeksekusi
 * statement tetapi koneksi putus sebelum acknowledgement sampai ke aplikasi.
 */
export async function queryReadWithRetry<
  R extends QueryResultRow = any,
>(
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

    // Beri event loop sedikit waktu agar pg membersihkan broken client dari pool.
    await new Promise((resolve) => setTimeout(resolve, 75));

    return getPool().query<R>(text, params);
  }
}

export { isTransientPgError };
