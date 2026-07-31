import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock SEMUA dependency yang butuh env var (JWT_SECRET_KEY, DATABASE_URL) atau I/O
// nyata - modul-modul itu sengaja throw di module-load kalau env var kosong
// (fail-fast, lihat shared/auth/jwt.ts), yang akan menggagalkan test collection
// kalau tidak di-mock lebih dulu. Ini test unit murni, bukan integration test.
// Path relatif terhadap file test ini (modules/user/service/__tests__/).
vi.mock('../../repository/user.repository', () => ({
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock('../../repository/email.repository', () => ({
  sendVerificationEmail: vi.fn(),
}));
vi.mock('../../../portfolio', () => ({
  provisionPortfolio: vi.fn(),
}));
vi.mock('../../../../shared/auth/jwt', () => ({
  encrypt: vi.fn(async () => 'fake-jwt-token'),
}));

import bcrypt from 'bcryptjs';
import { login } from '../auth.service';
import { getUserByEmail } from '../../repository/user.repository';
import { InvalidCredentialsError } from '../../types/user.errors';
import type { User } from '../../types/user.types';

const mockGetUserByEmail = vi.mocked(getUserByEmail);

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'user@test.com',
    password_hash: bcrypt.hashSync('password-benar', 10),
    role: 'free',
    is_verified: true,
    is_pro: false,
    created_at: new Date().toISOString(),
    trial_ends_at: null,
    demo_ends_at: null,
    verification_code: null,
    reset_code: null,
    reset_code_expires: null,
    ...overrides,
  };
}

describe('auth.service login()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('berhasil login dengan email & password yang benar', async () => {
    mockGetUserByEmail.mockResolvedValue(makeUser());

    const result = await login({ email: 'user@test.com', password: 'password-benar' });

    expect(result.token).toBe('fake-jwt-token');
    expect(result.role).toBe('free');
  });

  it('menolak password yang salah dengan InvalidCredentialsError', async () => {
    mockGetUserByEmail.mockResolvedValue(makeUser());

    await expect(login({ email: 'user@test.com', password: 'password-salah' })).rejects.toThrow(InvalidCredentialsError);
  });

  it('menolak email yang tidak terdaftar dengan InvalidCredentialsError (bukan pesan berbeda - cegah user enumeration)', async () => {
    mockGetUserByEmail.mockResolvedValue(null);

    await expect(login({ email: 'tidakada@test.com', password: 'apapun' })).rejects.toThrow(InvalidCredentialsError);
  });

  it('menolak akun free yang belum verifikasi email', async () => {
    mockGetUserByEmail.mockResolvedValue(makeUser({ is_verified: false, role: 'free' }));

    await expect(login({ email: 'user@test.com', password: 'password-benar' })).rejects.toThrow('Akun belum diverifikasi.');
  });

  it('admin TETAP bisa login meski is_verified false (pengecualian yang disengaja di kode)', async () => {
    mockGetUserByEmail.mockResolvedValue(makeUser({ is_verified: false, role: 'admin' }));

    const result = await login({ email: 'user@test.com', password: 'password-benar' });
    expect(result.role).toBe('admin');
  });

  it('remember=true menghasilkan maxAgeSec 30 hari, bukan 24 jam', async () => {
    mockGetUserByEmail.mockResolvedValue(makeUser());

    const result = await login({ email: 'user@test.com', password: 'password-benar', remember: true });
    expect(result.maxAgeSec).toBe(30 * 24 * 60 * 60);
  });
});
