import { Pool } from 'pg';

// Reused across hot reloads in dev and across warm serverless invocations in prod,
// so we don't open a fresh pool (and hit Neon's connection limit) on every request.
const globalForPg = globalThis as unknown as { __sahamlensPgPool?: Pool };

export const pool = globalForPg.__sahamlensPgPool || new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

if (!globalForPg.__sahamlensPgPool) globalForPg.__sahamlensPgPool = pool;
