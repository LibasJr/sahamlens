import { describe, it, expect, vi, beforeEach } from 'vitest';

// Path relatif terhadap file test ini (modules/user/controller/__tests__/) - pola
// sama dengan modules/user/service/__tests__/auth.service.test.ts, module ini
// butuh JWT_SECRET_KEY/DATABASE_URL nyata kalau tidak di-mock dulu.
vi.mock('../../../../shared/auth/session', () => ({
  getSession: vi.fn(),
  checkProAccess: vi.fn(),
}));
vi.mock('../../repository/user.repository', () => ({
  getUserById: vi.fn(),
}));
vi.mock('../../../../shared/auth/presence', () => ({
  getActiveUsers: vi.fn(),
}));
// Mock modules yang require DATABASE_URL untuk mencegah validation error saat import
vi.mock('../../../../shared/database/postgres.client', () => ({
  pool: { query: vi.fn() },
}));

import { handleGetProfile } from '../auth.controller';
import { getSession, checkProAccess } from '../../../../shared/auth/session';
import { getUserById } from '../../repository/user.repository';
import { getActiveUsers } from '../../../../shared/auth/presence';
import type { User } from '../../types/user.types';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'user@test.com',
    password_hash: 'hash',
    role: 'free',
    is_verified: true,
    is_pro: false,
    created_at: '2026-01-15T00:00:00.000Z',
    trial_ends_at: null,
    pro_expires_at: null,
    demo_ends_at: null,
    verification_code: null,
    verification_code_expires: null,
    reset_code: null,
    reset_code_expires: null,
    ...overrides,
  };
}

describe('handleGetProfile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tanpa sesi -> 401', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const result = await handleGetProfile();

    expect(result.status).toBe(401);
    expect(getUserById).not.toHaveBeenCalled();
  });

  it('sesi ada tapi user sudah terhapus dari database -> 401', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'user-1', email: 'user@test.com', role: 'free', is_pro: false, trial_ends_at: null });
    vi.mocked(getUserById).mockResolvedValue(null);

    const result = await handleGetProfile();

    expect(result.status).toBe(401);
  });

  it('user biasa (bukan admin) -> 200 tanpa field activeUsers, getActiveUsers tidak dipanggil, hasProAccess dari checkProAccess', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'user-1', email: 'user@test.com', role: 'free', is_pro: false, trial_ends_at: null });
    vi.mocked(getUserById).mockResolvedValue(makeUser({ role: 'free', is_pro: true, trial_ends_at: '2026-12-31T00:00:00.000Z' }));
    vi.mocked(checkProAccess).mockReturnValue(true);

    const result = await handleGetProfile();

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      email: 'user@test.com',
      role: 'free',
      isPro: true,
      hasProAccess: true,
      isVerified: true,
      trialEndsAt: '2026-12-31T00:00:00.000Z',
      createdAt: '2026-01-15T00:00:00.000Z',
    });
    expect(checkProAccess).toHaveBeenCalledWith({
      id: 'user-1',
      email: 'user@test.com',
      role: 'free',
      is_pro: true,
      trial_ends_at: '2026-12-31T00:00:00.000Z',
    });
    expect(getActiveUsers).not.toHaveBeenCalled();
  });

  it('user admin -> 200 DENGAN field activeUsers dari getActiveUsers, sesi sendiri dikecualikan dari daftar', async () => {
    vi.mocked(getSession).mockResolvedValue({ id: 'user-2', email: 'admin@test.com', role: 'admin', is_pro: true, trial_ends_at: null });
    vi.mocked(getUserById).mockResolvedValue(makeUser({ id: 'user-2', email: 'admin@test.com', role: 'admin' }));
    vi.mocked(checkProAccess).mockReturnValue(true);
    const activeList = [
      { id: 'user-2', email: 'admin@test.com', role: 'admin', lastSeen: '2026-08-02T10:00:00.000Z' },
      { id: 'user-3', email: 'other@test.com', role: 'free', lastSeen: '2026-08-02T09:55:00.000Z' },
    ];
    vi.mocked(getActiveUsers).mockResolvedValue(activeList);

    const result = await handleGetProfile();

    expect(result.status).toBe(200);
    expect((result.body as any).hasProAccess).toBe(true);
    expect((result.body as any).activeUsers).toEqual([activeList[1]]);
  });
});
