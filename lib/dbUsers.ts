import { pool } from './db';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  is_verified: boolean;
  is_pro: boolean;
  created_at: string;
  trial_ends_at: string | null;
  demo_ends_at: string | null;
  verification_code: string | null;
  reset_code: string | null;
  reset_code_expires: string | null;
}

let schemaReady: Promise<void> | null = null;

// Lightweight auto-migrate: this project has no formal migration tooling, so we just
// make sure the table exists before the first query on any given warm instance.
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'free',
        is_verified BOOLEAN NOT NULL DEFAULT false,
        is_pro BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        trial_ends_at TIMESTAMPTZ,
        demo_ends_at TIMESTAMPTZ,
        verification_code TEXT,
        reset_code TEXT,
        reset_code_expires TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
    `).then(() => {});
  }
  return schemaReady;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  await ensureSchema();
  const { rows } = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  return rows[0] || null;
}

export async function getUserById(id: string): Promise<User | null> {
  await ensureSchema();
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function getAllUsers(): Promise<User[]> {
  await ensureSchema();
  const { rows } = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
  return rows;
}

export async function createUser(user: User): Promise<void> {
  await ensureSchema();
  await pool.query(
    `INSERT INTO users (id, email, password_hash, role, is_verified, is_pro, created_at, trial_ends_at, demo_ends_at, verification_code, reset_code, reset_code_expires)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [user.id, user.email, user.password_hash, user.role, user.is_verified, user.is_pro, user.created_at, user.trial_ends_at, user.demo_ends_at, user.verification_code, user.reset_code, user.reset_code_expires]
  );
}

export async function updateUser(id: string, updates: Partial<User>): Promise<void> {
  await ensureSchema();
  const keys = Object.keys(updates);
  if (keys.length === 0) return;
  const setClause = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
  const values = keys.map((k) => (updates as any)[k]);
  await pool.query(`UPDATE users SET ${setClause} WHERE id = $1`, [id, ...values]);
}
