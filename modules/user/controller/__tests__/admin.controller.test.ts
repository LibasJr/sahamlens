import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';

vi.mock('../../repository/user.repository', () => ({
  getUserByEmail: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock('../../repository/admin-secret.repository', () => ({
  getAdminSecretHash: vi.fn(),
  setAdminSecretHash: vi.fn(),
}));
vi.mock('../../../../shared/database/postgres.client', () => ({
  pool: { query: vi.fn() },
}));

import { handleSetProStatus, handleAdminLoginByKey, handleChangeAdminSecret } from '../admin.controller';
import { getUserByEmail, updateUser } from '../../repository/user.repository';
import { getAdminSecretHash, setAdminSecretHash } from '../../repository/admin-secret.repository';
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

describe('handleAdminLoginByKey', () => {
  const ORIGINAL_ENV = process.env.ADMIN_SECRET_KEY;

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.ADMIN_SECRET_KEY;
    } else {
      process.env.ADMIN_SECRET_KEY = ORIGINAL_ENV;
    }
  });

  it('key null -> 404', async () => {
    const result = await handleAdminLoginByKey(null);
    expect(result.status).toBe(404);
  });

  it('hash di DB ada dan cocok -> berhasil, env var tidak perlu dicek', async () => {
    process.env.ADMIN_SECRET_KEY = 'env-secret-tidak-dipakai';
    vi.mocked(getAdminSecretHash).mockResolvedValue(bcrypt.hashSync('password-db-benar', 10));

    const result = await handleAdminLoginByKey('password-db-benar');

    expect(result.status).toBe(302);
    expect(result.redirectTo).toBe('/dashboard');
  });

  it('hash di DB ada tapi tidak cocok, env var cocok -> tetap berhasil (jalur darurat)', async () => {
    process.env.ADMIN_SECRET_KEY = 'env-secret-darurat';
    vi.mocked(getAdminSecretHash).mockResolvedValue(bcrypt.hashSync('password-db-lain', 10));

    const result = await handleAdminLoginByKey('env-secret-darurat');

    expect(result.status).toBe(302);
  });

  it('hash di DB null (belum pernah ganti) -> jatuh ke env var', async () => {
    process.env.ADMIN_SECRET_KEY = 'env-secret-darurat';
    vi.mocked(getAdminSecretHash).mockResolvedValue(null);

    const result = await handleAdminLoginByKey('env-secret-darurat');

    expect(result.status).toBe(302);
  });

  it('tidak cocok keduanya -> 404', async () => {
    process.env.ADMIN_SECRET_KEY = 'env-secret-darurat';
    vi.mocked(getAdminSecretHash).mockResolvedValue(bcrypt.hashSync('password-db-lain', 10));

    const result = await handleAdminLoginByKey('salah-semua');

    expect(result.status).toBe(404);
  });

  it('getAdminSecretHash gagal (DB down) -> tetap jatuh ke env var, tidak melempar error', async () => {
    process.env.ADMIN_SECRET_KEY = 'env-secret-darurat';
    vi.mocked(getAdminSecretHash).mockRejectedValue(new Error('DB down'));

    const result = await handleAdminLoginByKey('env-secret-darurat');

    expect(result.status).toBe(302);
  });

  it('hash di DB rusak (bcrypt.compare gagal) -> tetap jatuh ke env var, tidak melempar error', async () => {
    process.env.ADMIN_SECRET_KEY = 'env-secret-darurat';
    vi.mocked(getAdminSecretHash).mockResolvedValue('hash-rusak-bukan-bcrypt-valid');

    const result = await handleAdminLoginByKey('env-secret-darurat');

    expect(result.status).toBe(302);
  });
});

describe('handleChangeAdminSecret', () => {
  const ORIGINAL_ENV = process.env.ADMIN_SECRET_KEY;

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.ADMIN_SECRET_KEY;
    } else {
      process.env.ADMIN_SECRET_KEY = ORIGINAL_ENV;
    }
  });

  it('tanpa cookie admin valid -> ForbiddenError, setAdminSecretHash tidak dipanggil', async () => {
    await expect(
      handleChangeAdminSecret(adminCookieStore(false), { currentKey: 'apa-saja', newKey: 'password-baru-yang-panjang' })
    ).rejects.toThrow(ForbiddenError);
    expect(setAdminSecretHash).not.toHaveBeenCalled();
  });

  it('currentKey/newKey kosong atau bukan string -> ValidationError', async () => {
    await expect(
      handleChangeAdminSecret(adminCookieStore(true), { currentKey: undefined, newKey: 'password-baru-yang-panjang' })
    ).rejects.toThrow(ValidationError);
  });

  it('newKey kurang dari 12 karakter -> ValidationError', async () => {
    process.env.ADMIN_SECRET_KEY = 'env-secret-darurat';

    await expect(
      handleChangeAdminSecret(adminCookieStore(true), { currentKey: 'env-secret-darurat', newKey: 'pendek' })
    ).rejects.toThrow(ValidationError);
  });

  it('currentKey salah (tidak cocok DB maupun env var) -> ValidationError, setAdminSecretHash tidak dipanggil', async () => {
    process.env.ADMIN_SECRET_KEY = 'env-secret-darurat';
    vi.mocked(getAdminSecretHash).mockResolvedValue(null);

    await expect(
      handleChangeAdminSecret(adminCookieStore(true), { currentKey: 'salah-total', newKey: 'password-baru-yang-panjang' })
    ).rejects.toThrow(ValidationError);
    expect(setAdminSecretHash).not.toHaveBeenCalled();
  });

  it('path sukses lewat env var -> setAdminSecretHash dipanggil dengan hash (bukan plaintext), balas 200', async () => {
    process.env.ADMIN_SECRET_KEY = 'env-secret-darurat';
    vi.mocked(getAdminSecretHash).mockResolvedValue(null);
    vi.mocked(setAdminSecretHash).mockResolvedValue(undefined);

    const result = await handleChangeAdminSecret(adminCookieStore(true), {
      currentKey: 'env-secret-darurat',
      newKey: 'password-baru-yang-panjang',
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ success: true });
    expect(setAdminSecretHash).toHaveBeenCalledTimes(1);
    const savedHash = vi.mocked(setAdminSecretHash).mock.calls[0][0];
    expect(savedHash).not.toBe('password-baru-yang-panjang');
    expect(bcrypt.compareSync('password-baru-yang-panjang', savedHash)).toBe(true);
  });

  it('path sukses lewat password DB lama -> berhasil', async () => {
    vi.mocked(getAdminSecretHash).mockResolvedValue(bcrypt.hashSync('password-db-lama', 10));
    vi.mocked(setAdminSecretHash).mockResolvedValue(undefined);

    const result = await handleChangeAdminSecret(adminCookieStore(true), {
      currentKey: 'password-db-lama',
      newKey: 'password-baru-yang-lain-lagi',
    });

    expect(result.status).toBe(200);
  });
});
