import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../database/postgres.client', () => ({
  pool: { query: vi.fn() },
}));

import { checkProAccessLive } from '../session';
import { pool } from '../../database/postgres.client';
import type { SessionPayload } from '../jwt';

function makeSession(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return { id: 'user-1', email: 'user@test.com', role: 'free', is_pro: false, trial_ends_at: null, ...overrides };
}

describe('checkProAccessLive', () => {
  beforeEach(() => vi.clearAllMocks());

  it('session null -> false, tidak query DB', async () => {
    expect(await checkProAccessLive(null)).toBe(false);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('JWT sudah bilang Pro -> true tanpa query DB (jalur cepat)', async () => {
    expect(await checkProAccessLive(makeSession({ is_pro: true }))).toBe(true);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('JWT bilang bukan Pro tapi DB bilang sudah Pro (admin baru aktifkan) -> true', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ role: 'free', is_pro: true, trial_ends_at: null }] } as any);

    expect(await checkProAccessLive(makeSession({ is_pro: false }))).toBe(true);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT role, is_pro, trial_ends_at'), ['user-1']);
  });

  it('JWT dan DB sama-sama bilang bukan Pro -> false', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ role: 'free', is_pro: false, trial_ends_at: null }] } as any);

    expect(await checkProAccessLive(makeSession({ is_pro: false }))).toBe(false);
  });

  it('user tidak ketemu di DB -> false', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);

    expect(await checkProAccessLive(makeSession())).toBe(false);
  });

  it('query DB gagal -> false (fail-closed, bukan crash)', async () => {
    vi.mocked(pool.query).mockRejectedValue(new Error('DB down'));

    expect(await checkProAccessLive(makeSession())).toBe(false);
  });
});

// --- Masa berlaku Pro (2026-08-03) ---
// checkProAccess() sinkron, tidak menyentuh DB, jadi diuji langsung tanpa mock query.
import { checkProAccess } from '../session';

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

describe('checkProAccess - masa berlaku', () => {
  it('Pro dengan tanggal di masa depan tetap lolos', () => {
    expect(checkProAccess(makeSession({ is_pro: true, pro_expires_at: daysFromNow(30) }))).toBe(true);
  });

  it('Pro dengan tanggal yang sudah lewat DITOLAK', () => {
    expect(checkProAccess(makeSession({ is_pro: true, pro_expires_at: daysFromNow(-1) }))).toBe(false);
  });

  it('Pro tanpa tanggal (null) lolos - kompatibilitas akun lama', () => {
    expect(checkProAccess(makeSession({ is_pro: true, pro_expires_at: null }))).toBe(true);
  });

  it('Pro dengan field tanggal tidak ada sama sekali lolos - JWT lama', () => {
    expect(checkProAccess(makeSession({ is_pro: true }))).toBe(true);
  });

  it("role 'pro' dengan tanggal lewat DITOLAK - celah lama tertutup", () => {
    expect(checkProAccess(makeSession({ role: 'pro', is_pro: true, pro_expires_at: daysFromNow(-1) }))).toBe(false);
  });

  it('admin selalu lolos meski tanpa tanggal', () => {
    expect(checkProAccess(makeSession({ role: 'admin' }))).toBe(true);
  });

  it('admin lolos meski pro_expires_at sudah lewat', () => {
    expect(checkProAccess(makeSession({ role: 'admin', is_pro: true, pro_expires_at: daysFromNow(-30) }))).toBe(true);
  });

  it('trial aktif tetap lolos meski bukan Pro', () => {
    expect(checkProAccess(makeSession({ trial_ends_at: daysFromNow(3) }))).toBe(true);
  });

  it('trial kedaluwarsa dan bukan Pro ditolak', () => {
    expect(checkProAccess(makeSession({ trial_ends_at: daysFromNow(-1) }))).toBe(false);
  });

  it('sesi null ditolak', () => {
    expect(checkProAccess(null)).toBe(false);
  });
});
