import { Pool } from 'pg';
import { getNodeEnv } from '../config/env';

// Reused across hot reloads in dev and across warm serverless invocations in prod,
// so we don't open a fresh pool (and hit Neon's connection limit) on every request.
const globalForPg = globalThis as unknown as { __sahamlensPgPool?: Pool };

// rejectUnauthorized: true (bukan false) - Neon memakai sertifikat TLS yang valid
// dari CA publik, jadi verifikasi ketat aman dipakai dan tidak membuka celah MITM.
// Diverifikasi manual sebelum diubah: koneksi tetap berhasil dengan setting ini.
export const pool =
  globalForPg.__sahamlensPgPool ||
  new Pool({
    connectionString: getNodeEnv().DATABASE_URL,
    ssl: { rejectUnauthorized: true },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

if (!globalForPg.__sahamlensPgPool) globalForPg.__sahamlensPgPool = pool;
