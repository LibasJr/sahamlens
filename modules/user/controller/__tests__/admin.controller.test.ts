import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
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

import { handleSetProStatus, handleGetProStatus, handleAdminLoginByKey, handleChangeAdminSecret } from '../admin.controller';
import { getUserByEmail, updateUser } from '../../repository/user.repository';
import { getAdminSecretHash, setAdminSecretHash } from '../../repository/admin-secret.repository';
import { ADMIN_COOKIE } from '../../../../shared/constants/cookie-names';
import { signAdminToken } from '../../../../shared/auth/admin-token';
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
    pro_expires_at: null,
    demo_ends_at: null,
    verification_code: null,
    verification_code_expires: null,
    reset_code: null,
    reset_code_expires: null,
    ...overrides,
  };
}

// Token asli, ditandatangani sekali sebelum semua test supaya seluruh call site
// adminCookieStore() tetap sinkron. Cookie admin bukan lagi konstanta - lihat
// shared/auth/admin-token.ts.
let ADMIN_TOKEN = '';
beforeAll(async () => {
  ADMIN_TOKEN = await signAdminToken();
});

function adminCookieStore(isAdmin: boolean) {
  return {
    get: (name: string) => {
      if (name !== ADMIN_COOKIE) return undefined;
      return isAdmin ? { value: ADMIN_TOKEN } : undefined;
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

    // Tanpa months/expiresAt, defaultnya 1 bulan - aktivasi tidak boleh lagi menghasilkan
    // akses tanpa batas waktu.
    const arg = vi.mocked(updateUser).mock.calls[0][1] as any;
    expect(arg.is_pro).toBe(true);
    expect(new Date(arg.pro_expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ email: 'user@test.com', isPro: true });
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
    // bcryptjs cuma melempar kalau string-nya persis 60 karakter tapi isinya bukan
    // hash valid (mis. salt version salah) - string pendek biasa cuma resolve false
    // lewat length guard, tidak pernah memicu jalur throw yang mau diuji di sini.
    vi.mocked(getAdminSecretHash).mockResolvedValue('x'.repeat(60));

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

describe('handleSetProStatus - durasi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('months: 1 menulis is_pro true beserta tanggal berakhir', async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(makeUser({ id: 'user-42', pro_expires_at: null }));
    vi.mocked(updateUser).mockResolvedValue(undefined);

    await handleSetProStatus(adminCookieStore(true), { email: 'a@b.com', isPro: true, months: 1 });

    const arg = vi.mocked(updateUser).mock.calls[0][1] as any;
    expect(arg.is_pro).toBe(true);
    expect(new Date(arg.pro_expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('isPro false mengosongkan tanggal, bukan menyisakannya', async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(makeUser({ id: 'user-42', pro_expires_at: '2027-01-01T00:00:00.000Z' }));
    vi.mocked(updateUser).mockResolvedValue(undefined);

    await handleSetProStatus(adminCookieStore(true), { email: 'a@b.com', isPro: false });

    expect(updateUser).toHaveBeenCalledWith('user-42', { is_pro: false, pro_expires_at: null });
  });

  it('expiresAt eksplisit dipakai apa adanya', async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(makeUser({ id: 'user-42', pro_expires_at: null }));
    vi.mocked(updateUser).mockResolvedValue(undefined);
    const target = '2027-06-30T00:00:00.000Z';

    await handleSetProStatus(adminCookieStore(true), { email: 'a@b.com', isPro: true, expiresAt: target });

    const arg = vi.mocked(updateUser).mock.calls[0][1] as any;
    expect(arg.pro_expires_at).toBe(target);
  });
});

describe('handleGetProStatus', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tanpa cookie admin -> ForbiddenError', async () => {
    await expect(
      handleGetProStatus(adminCookieStore(false), { email: 'a@b.com' })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('mengembalikan status dan tanggal, tanpa field sensitif', async () => {
    vi.mocked(getUserByEmail).mockResolvedValue(
      makeUser({
        id: 'user-42',
        email: 'a@b.com',
        is_pro: true,
        pro_expires_at: '2027-01-01T00:00:00.000Z',
        password_hash: 'RAHASIA',
        verification_code: '123456',
        reset_code: '654321',
      })
    );

    const res = await handleGetProStatus(adminCookieStore(true), { email: 'a@b.com' });

    expect(res.body).toEqual({ email: 'a@b.com', isPro: true, proExpiresAt: '2027-01-01T00:00:00.000Z' });
    expect(JSON.stringify(res.body)).not.toContain('RAHASIA');
    expect(JSON.stringify(res.body)).not.toContain('123456');
    expect(JSON.stringify(res.body)).not.toContain('654321');
  });
});
