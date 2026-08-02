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
