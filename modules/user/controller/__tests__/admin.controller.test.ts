import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../repository/user.repository', () => ({
  getUserByEmail: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock('../../../../shared/database/postgres.client', () => ({
  pool: { query: vi.fn() },
}));

import { handleSetProStatus } from '../admin.controller';
import { getUserByEmail, updateUser } from '../../repository/user.repository';
import { ADMIN_COOKIE, ADMIN_COOKIE_VALUE } from '../../../../shared/constants/cookie-names';
import { ForbiddenError, ValidationError, NotFoundError } from '../../../../shared/errors/app-error';
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
    demo_ends_at: null,
    verification_code: null,
    verification_code_expires: null,
    reset_code: null,
    reset_code_expires: null,
    ...overrides,
  };
}

function adminCookieStore(isAdmin: boolean) {
  return {
    get: (name: string) => {
      if (name !== ADMIN_COOKIE) return undefined;
      return isAdmin ? { value: ADMIN_COOKIE_VALUE } : undefined;
    },
  };
}

describe('handleSetProStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tanpa cookie admin valid -> melempar ForbiddenError, updateUser tidak dipanggil', async () => {
    await expect(
      handleSetProStatus(adminCookieStore(false), { email: 'user@test.com', isPro: true })
    ).rejects.toThrow(ForbiddenError);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('email bukan string -> melempar ValidationError', async () => {
    await expect(
      handleSetProStatus(adminCookieStore(true), { email: undefined, isPro: true })
    ).rejects.toThrow(ValidationError);
  });

  it('isPro bukan boolean -> melempar ValidationError', async () => {
    await expect(
      handleSetProStatus(adminCookieStore(true), { email: 'user@test.com', isPro: 'yes' })
    ).rejects.toThrow(ValidationError);
  });

  it('user tidak ketemu -> melempar NotFoundError', async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(null);

    await expect(
      handleSetProStatus(adminCookieStore(true), { email: 'notfound@test.com', isPro: true })
    ).rejects.toThrow(NotFoundError);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('path sukses -> updateUser dipanggil dengan is_pro yang benar, balas 200', async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(makeUser({ id: 'user-42', email: 'user@test.com' }));
    vi.mocked(updateUser).mockResolvedValue(undefined);

    const result = await handleSetProStatus(adminCookieStore(true), { email: 'user@test.com', isPro: true });

    expect(updateUser).toHaveBeenCalledWith('user-42', { is_pro: true });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ email: 'user@test.com', isPro: true });
  });
});
