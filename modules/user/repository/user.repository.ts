import { pool } from '../../../shared/database/postgres.client';
import type { User } from '../types/user.types';
import type { AuthRequestMeta } from '../../../shared/security/auth-request-meta';

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
      -- Fase pengujian belum memiliki tanggal akhir akses. Kolom dipertahankan demi
      -- kompatibilitas sesi/histori, tetapi nilai lama dibersihkan sekali per instance
      -- agar Neon maupun profil pengguna tidak lagi menunjukkan batas 7 hari semu.
      UPDATE users SET trial_ends_at = NULL WHERE trial_ends_at IS NOT NULL;
      CREATE TABLE IF NOT EXISTS user_auth_events (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        email TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK (event_type IN ('signup', 'login', 'verify')),
        ip_hash TEXT,
        ip_prefix TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_user_auth_events_created_at ON user_auth_events (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_user_auth_events_user_id ON user_auth_events (user_id, created_at DESC);
      -- Funnel produk memakai ID acak per browser, bukan email atau IP. Satu kejadian
      -- per jenis/fitur/hari membuat metrik tetap berguna tanpa menjadikan tabel ini
      -- log klik yang terlalu rinci atau mudah membengkak karena refresh halaman.
      CREATE TABLE IF NOT EXISTS product_funnel_events (
        id BIGSERIAL PRIMARY KEY,
        visitor_id UUID NOT NULL,
        event_type TEXT NOT NULL CHECK (event_type IN ('locked_view', 'signup_click', 'signup_completed')),
        feature TEXT NOT NULL,
        event_date DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (visitor_id, event_type, feature, event_date)
      );
      CREATE INDEX IF NOT EXISTS idx_product_funnel_events_created_at ON product_funnel_events (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_product_funnel_events_event_type ON product_funnel_events (event_type, created_at DESC);
      -- Retensi singkat: cukup untuk investigasi abuse tanpa menyimpan jejak jaringan
      -- pengguna lebih lama dari yang dibutuhkan operasional.
      DELETE FROM user_auth_events WHERE created_at < NOW() - INTERVAL '90 days';
      DELETE FROM product_funnel_events WHERE created_at < NOW() - INTERVAL '90 days';
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

export type AuthEventType = 'signup' | 'login' | 'verify';

export interface AuthEventRow {
  id: number;
  user_id: string | null;
  email: string;
  event_type: AuthEventType;
  ip_hash: string | null;
  ip_prefix: string | null;
  user_agent: string | null;
  created_at: string;
}

export type ProductFunnelEventType = 'locked_view' | 'signup_click' | 'signup_completed';

export interface ProductFunnelSummary {
  periodDays: number;
  lockedViewVisitors: number;
  signupClickVisitors: number;
  signupCompletedVisitors: number;
  clickRatePct: number | null;
  completionRatePct: number | null;
  topFeatures: { feature: string; lockedViews: number; signupClicks: number; signupsCompleted: number }[];
}

export async function recordProductFunnelEvent(input: {
  visitorId: string;
  eventType: ProductFunnelEventType;
  feature: string;
}): Promise<void> {
  await ensureSchema();
  await pool.query(
    `INSERT INTO product_funnel_events (visitor_id, event_type, feature)
     VALUES ($1, $2, $3)
     ON CONFLICT (visitor_id, event_type, feature, event_date) DO NOTHING`,
    [input.visitorId, input.eventType, input.feature],
  );
}

/** Ringkasan ringan untuk admin: browser unik, bukan identitas individu. */
export async function getProductFunnelSummary(periodDays = 30): Promise<ProductFunnelSummary> {
  await ensureSchema();
  const safeDays = Math.max(1, Math.min(90, Math.floor(periodDays)));
  const [summaryResult, featuresResult] = await Promise.all([
    pool.query<Pick<ProductFunnelSummary, 'lockedViewVisitors' | 'signupClickVisitors' | 'signupCompletedVisitors'>>(
      `SELECT
         COUNT(DISTINCT visitor_id) FILTER (WHERE event_type = 'locked_view')::int AS "lockedViewVisitors",
         COUNT(DISTINCT visitor_id) FILTER (WHERE event_type = 'signup_click')::int AS "signupClickVisitors",
         COUNT(DISTINCT visitor_id) FILTER (WHERE event_type = 'signup_completed')::int AS "signupCompletedVisitors"
       FROM product_funnel_events
       WHERE created_at >= NOW() - ($1 * INTERVAL '1 day')`,
      [safeDays],
    ),
    pool.query<{ feature: string; lockedViews: number; signupClicks: number; signupsCompleted: number }>(
      `SELECT feature,
         COUNT(DISTINCT visitor_id) FILTER (WHERE event_type = 'locked_view')::int AS "lockedViews",
         COUNT(DISTINCT visitor_id) FILTER (WHERE event_type = 'signup_click')::int AS "signupClicks",
         COUNT(DISTINCT visitor_id) FILTER (WHERE event_type = 'signup_completed')::int AS "signupsCompleted"
       FROM product_funnel_events
       WHERE created_at >= NOW() - ($1 * INTERVAL '1 day')
       GROUP BY feature
       ORDER BY "signupClicks" DESC, "lockedViews" DESC, feature ASC
       LIMIT 10`,
      [safeDays],
    ),
  ]);
  const summary = summaryResult.rows[0] ?? {
    lockedViewVisitors: 0,
    signupClickVisitors: 0,
    signupCompletedVisitors: 0,
  };
  return {
    periodDays: safeDays,
    ...summary,
    clickRatePct: summary.lockedViewVisitors > 0
      ? (summary.signupClickVisitors / summary.lockedViewVisitors) * 100
      : null,
    completionRatePct: summary.signupClickVisitors > 0
      ? (summary.signupCompletedVisitors / summary.signupClickVisitors) * 100
      : null,
    topFeatures: featuresResult.rows,
  };
}

/** Audit keberhasilan autentikasi. IP mentah sengaja tidak pernah masuk database. */
export async function recordAuthEvent(input: {
  userId: string | null;
  email: string;
  eventType: AuthEventType;
  requestMeta: AuthRequestMeta;
}): Promise<void> {
  await ensureSchema();
  await pool.query(
    `INSERT INTO user_auth_events (user_id, email, event_type, ip_hash, ip_prefix, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.userId,
      input.email.trim().toLowerCase(),
      input.eventType,
      input.requestMeta.ipHash,
      input.requestMeta.ipPrefix,
      input.requestMeta.userAgent,
    ],
  );
}

export async function getRecentAuthEvents(limit = 100): Promise<AuthEventRow[]> {
  await ensureSchema();
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const { rows } = await pool.query<AuthEventRow>(
    `SELECT id, user_id, email, event_type, ip_hash, ip_prefix, user_agent, created_at
     FROM user_auth_events
     ORDER BY created_at DESC
     LIMIT $1`,
    [safeLimit],
  );
  return rows;
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
