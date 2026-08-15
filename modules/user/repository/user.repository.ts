import { pool } from '../../../shared/database/postgres.client';
import type { User } from '../types/user.types';

let schemaReady: Promise<void> | null = null;

// Lightweight auto-migrate: this project has no formal migration tooling, so we just
// make sure the table exists before the first query on any given warm instance.
// TODO Fase 1 roadmap: ganti dengan Drizzle Kit + file migrasi ter-commit.
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = pool
      .query(
        `
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
      -- Kolom ditambah belakangan (audit bug 2026-08-01, temuan: OTP signup sebelumnya
      -- tidak pernah expire) - ADD COLUMN IF NOT EXISTS supaya aman dijalankan berkali-kali
      -- baik di DB baru (sudah kena CREATE TABLE di atas) maupun DB lama yang sudah ada.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code_expires TIMESTAMPTZ;
      -- Masa berlaku Pro (2026-08-03). Sebelumnya is_pro cuma boolean tanpa batas waktu,
      -- sehingga akun yang membayar satu bulan mendapat akses selamanya.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pro_expires_at TIMESTAMPTZ;
      -- Audit aktivitas admin: login terakhir dan aktivitas request terautentikasi
      -- dipisahkan agar "aktif bulan ini" tidak disamakan dengan sekadar pernah daftar.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_users_last_active_at ON users (last_active_at DESC);
      CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users (last_login_at DESC);
      -- Akun Pro yang sudah ada diberi masa berlaku 1 bulan sejak migrasi ini jalan.
      -- Admin dilewati supaya tidak mengunci diri sendiri. Kondisi IS NULL membuat
      -- pernyataan ini aman dijalankan berkali-kali - akun yang sudah punya tanggal
      -- tidak akan tertimpa.
      UPDATE users SET pro_expires_at = NOW() + INTERVAL '1 month'
      WHERE is_pro = true AND pro_expires_at IS NULL AND role <> 'admin';
    `
      )
      .then(() => {});
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

export interface AdminUserActivitySummary {
  active24h: number;
  active7d: number;
  active30d: number;
  inactive30d: number;
}

export interface InactiveUserRow {
  id: string;
  email: string;
  role: string;
  last_login_at: string | null;
  last_active_at: string | null;
}

/** Ringkasan berbasis aktivitas tersimpan, bukan presence Redis 5 menit. */
export async function getAdminUserActivityReport(inactiveLimit = 100): Promise<{
  summary: AdminUserActivitySummary;
  inactiveUsers: InactiveUserRow[];
}> {
  await ensureSchema();
  const safeLimit = Math.max(1, Math.min(200, Math.floor(inactiveLimit)));
  const [summaryResult, inactiveResult] = await Promise.all([
    pool.query<AdminUserActivitySummary>(
      `SELECT
         COUNT(*) FILTER (WHERE last_active_at >= NOW() - INTERVAL '24 hours')::int AS "active24h",
         COUNT(*) FILTER (WHERE last_active_at >= NOW() - INTERVAL '7 days')::int AS "active7d",
         COUNT(*) FILTER (WHERE last_active_at >= NOW() - INTERVAL '30 days')::int AS "active30d",
         COUNT(*) FILTER (WHERE last_active_at IS NULL OR last_active_at < NOW() - INTERVAL '30 days')::int AS "inactive30d"
       FROM users`,
    ),
    pool.query<InactiveUserRow>(
      `SELECT id, email, role, last_login_at, last_active_at
       FROM users
       WHERE last_active_at IS NULL OR last_active_at < NOW() - INTERVAL '30 days'
       ORDER BY last_active_at DESC NULLS LAST, last_login_at DESC NULLS LAST, created_at DESC
       LIMIT $1`,
      [safeLimit],
    ),
  ]);

  return {
    summary: summaryResult.rows[0] ?? { active24h: 0, active7d: 0, active30d: 0, inactive30d: 0 },
    inactiveUsers: inactiveResult.rows,
  };
}

/** Login berhasil harus selalu memperbarui dua waktu sekaligus. */
export async function recordSuccessfulLogin(userId: string): Promise<void> {
  await ensureSchema();
  await pool.query(
    'UPDATE users SET last_login_at = NOW(), last_active_at = NOW() WHERE id = $1',
    [userId],
  );
}

export async function createUser(user: User): Promise<void> {
  await ensureSchema();
  await pool.query(
    `INSERT INTO users (id, email, password_hash, role, is_verified, is_pro, created_at, trial_ends_at, demo_ends_at, verification_code, verification_code_expires, reset_code, reset_code_expires)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      user.id,
      user.email,
      user.password_hash,
      user.role,
      user.is_verified,
      user.is_pro,
      user.created_at,
      user.trial_ends_at,
      user.demo_ends_at,
      user.verification_code,
      user.verification_code_expires,
      user.reset_code,
      user.reset_code_expires,
    ]
  );
}

// Allowlist kolom eksplisit - temuan M4 di audit: sebelumnya nama kolom diselipkan
// lewat interpolasi string dari Object.keys(updates) tanpa batasan. Belum ada
// exploit karena semua pemanggil pakai objek literal, tapi begitu ada satu
// pemanggil yang meneruskan hasil req.json() mentah, itu jadi SQL injection.
const UPDATABLE_COLUMNS = new Set<keyof User>([
  'email',
  'password_hash',
  'role',
  'is_verified',
  'is_pro',
  'trial_ends_at',
  'pro_expires_at',
  'demo_ends_at',
  'verification_code',
  'verification_code_expires',
  'reset_code',
  'reset_code_expires',
]);

export async function updateUser(id: string, updates: Partial<User>): Promise<void> {
  await ensureSchema();
  const keys = Object.keys(updates).filter((k): k is keyof User => UPDATABLE_COLUMNS.has(k as keyof User));
  if (keys.length === 0) return;
  const setClause = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
  const values = keys.map((k) => (updates as any)[k]);
  await pool.query(`UPDATE users SET ${setClause} WHERE id = $1`, [id, ...values]);
}
