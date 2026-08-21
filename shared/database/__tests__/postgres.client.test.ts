import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Pool dibuat lazy, jadi test ini tidak pernah membuka koneksi sungguhan - yang diuji
// murni kapan validasi DATABASE_URL dijalankan, bukan konektivitas Postgres.
describe('postgres.client', () => {
  beforeEach(() => {
    vi.resetModules();
    delete (globalThis as Record<string, unknown>).__sahamlensPgPool;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as Record<string, unknown>).__sahamlensPgPool;
  });

  it('modul bisa diimpor walau DATABASE_URL kosong - route yang tidak menyentuh DB tidak ikut mati', async () => {
    vi.stubEnv('DATABASE_URL', '');

    await expect(import('../postgres.client')).resolves.toHaveProperty('pool');
  });

  it('DATABASE_URL kosong baru dilaporkan saat pool benar-benar dipakai, dengan nama variabelnya', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { pool } = await import('../postgres.client');

    expect(() => pool.query('SELECT 1')).toThrow(/DATABASE_URL/);
  });

  it('pool dibuat sekali lalu dipakai ulang, bukan pool baru tiap akses', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db');
    const { pool } = await import('../postgres.client');

    void pool.totalCount;
    const first = (globalThis as Record<string, unknown>).__sahamlensPgPool;
    void pool.totalCount;
    const second = (globalThis as Record<string, unknown>).__sahamlensPgPool;

    expect(first).toBeDefined();
    expect(second).toBe(first);
  });

  it.each([
    'postgresql://user:pass@127.0.0.1:5432/db',
    'postgresql://user:pass@localhost:5432/db',
    'postgresql://user:pass@[::1]:5432/db',
  ])('menonaktifkan TLS hanya untuk database loopback: %s', async (databaseUrl) => {
    const { resolveDatabaseSsl } = await import('../postgres.client');

    expect(resolveDatabaseSsl(databaseUrl)).toBe(false);
  });

  it('mempertahankan verifikasi TLS ketat untuk database remote', async () => {
    const { resolveDatabaseSsl } = await import('../postgres.client');

    expect(resolveDatabaseSsl('postgresql://user:pass@example.com:5432/db')).toEqual({
      rejectUnauthorized: true,
    });
  });
});
