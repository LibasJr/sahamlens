import { Pool } from 'pg';
import { getNodeEnv } from '../config/env';

// Reused across hot reloads in dev and across warm serverless invocations in prod,
// so we don't open a fresh pool (and hit Neon's connection limit) on every request.
const globalForPg = globalThis as unknown as { __sahamlensPgPool?: Pool };

// Pool dibuat saat PERTAMA DIPAKAI, bukan saat modul diimpor. Dulu `new Pool(...)`
// jalan di top-level, jadi getNodeEnv() melempar sejak import - satu env var yang
// belum diisi membuat SEMUA route yang mengimpor modul ini secara transitif balas
// 500, termasuk route yang tidak menyentuh database sama sekali (mis. /api/backtest
// lewat modules/user). DATABASE_URL tetap wajib dan tetap melempar keras, tapi baru
// pada query pertama yang benar-benar butuh Postgres.
function getPool(): Pool {
  if (!globalForPg.__sahamlensPgPool) {
    // rejectUnauthorized: true (bukan false) - Neon memakai sertifikat TLS yang valid
    // dari CA publik, jadi verifikasi ketat aman dipakai dan tidak membuka celah MITM.
    // Diverifikasi manual sebelum diubah: koneksi tetap berhasil dengan setting ini.
    globalForPg.__sahamlensPgPool = new Pool({
      connectionString: getNodeEnv().DATABASE_URL,
      ssl: { rejectUnauthorized: true },
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return globalForPg.__sahamlensPgPool;
}

// Proxy supaya call site tetap menulis `pool.query(...)` / `pool.connect()` seperti
// sebelumnya - lazy-init ini tidak mengubah API belasan repository yang memakainya.
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const real = getPool();
    const value = Reflect.get(real, prop, real);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});
