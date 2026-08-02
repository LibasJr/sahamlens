import { pool } from '../../../shared/database/postgres.client';

// Password akses /admin disimpan di sini (hash bcrypt, bukan plaintext) - sebelumnya
// cuma ADMIN_SECRET_KEY env var yang tidak bisa dibaca ulang begitu tersimpan sebagai
// tipe "Sensitive" di Vercel, dan butuh deploy ulang tiap ganti. Tabel ini bikin admin
// bisa ganti sendiri lewat form di /admin, langsung aktif tanpa deploy ulang.
// ADMIN_SECRET_KEY TETAP dipertahankan terpisah sebagai jalur darurat - lihat
// verifyAdminSecret() di admin.controller.ts.
let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = pool
      .query(
        `
      CREATE TABLE IF NOT EXISTS admin_secret (
        id INTEGER PRIMARY KEY,
        secret_hash TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `
      )
      .then(() => {});
  }
  return schemaReady;
}

export async function getAdminSecretHash(): Promise<string | null> {
  await ensureSchema();
  const { rows } = await pool.query('SELECT secret_hash FROM admin_secret WHERE id = 1');
  return rows[0]?.secret_hash ?? null;
}

export async function setAdminSecretHash(hash: string): Promise<void> {
  await ensureSchema();
  await pool.query(
    `INSERT INTO admin_secret (id, secret_hash, updated_at) VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET secret_hash = EXCLUDED.secret_hash, updated_at = EXCLUDED.updated_at`,
    [hash]
  );
}
