import { describe, it, expect, afterEach } from 'vitest';
import { computeRole, hasProAccessFor, type AuthUser, fetchAuthProbe, resolveAuthState } from '../useAuthUser';

const DAY_MS = 24 * 60 * 60 * 1000;

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'u1',
    email: 'user@test.com',
    role: 'free',
    is_pro: false,
    trial_ends_at: null,
    pro_expires_at: null,
    ...overrides,
  };
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

describe('computeRole', () => {
  it('tanpa sesi = GUEST', () => {
    expect(computeRole(null).effectiveRole).toBe('guest');
  });

  it('role admin = ADMIN, tanpa hitung mundur trial', () => {
    const r = computeRole(makeUser({ role: 'admin' }));
    expect(r.effectiveRole).toBe('admin');
    expect(r.trialDaysLeft).toBeNull();
  });

  it('mode testing memberi akses akun tanpa hitung mundur walau tanggal lama masih ada', () => {
    const r = computeRole(makeUser({ trial_ends_at: daysFromNow(6.2) }));
    expect(r.effectiveRole).toBe('trial');
    expect(r.trialDaysLeft).toBeNull();
    expect(r.isTrialExpired).toBe(false);
  });

  it('tanggal akses lama yang sudah lewat tidak dapat mengunci akun testing', () => {
    const r = computeRole(makeUser({ trial_ends_at: daysFromNow(-1) }));
    expect(r.effectiveRole).toBe('trial');
    expect(r.isTrialExpired).toBe(false);
    expect(r.trialDaysLeft).toBeNull();
  });

  it('Pro aktif tetap dapat menu penuh walau trialnya sudah lewat', () => {
    const r = computeRole(makeUser({ is_pro: true, pro_expires_at: daysFromNow(30), trial_ends_at: daysFromNow(-5) }));
    expect(r.effectiveRole).toBe('trial');
    expect(r.trialDaysLeft).toBeNull();
    expect(r.isTrialExpired).toBe(false);
  });

  it('pro_expires_at null = Pro tanpa batas waktu', () => {
    expect(computeRole(makeUser({ is_pro: true, pro_expires_at: null })).effectiveRole).toBe('trial');
  });

  it('akun tetap mendapat akses selama testing walau status Pro sudah kedaluwarsa', () => {
    const r = computeRole(makeUser({ is_pro: true, pro_expires_at: daysFromNow(-1), trial_ends_at: daysFromNow(-9) }));
    expect(r.effectiveRole).toBe('trial');
    expect(r.isTrialExpired).toBe(false);
  });

  it('akun biasa tanpa tanggal akses mendapat akses selama testing', () => {
    const r = computeRole(makeUser());
    expect(r.effectiveRole).toBe('trial');
    expect(r.isTrialExpired).toBe(false);
  });
});

// BUG (dilaporkan 2026-08-06): pelanggan Pro 1 bulan tetap dapat notifikasi "limit
// habis". Panel admin mengaktifkan Pro dengan HANYA menulis is_pro + pro_expires_at
// (modules/user/controller/admin.controller.ts handleSetProStatus) - kolom `role`
// tidak pernah disentuh siapa pun, jadi tetap 'free' selamanya. Pemeriksaan Pro di
// sisi client dulu mencari role === 'pro' dan cookie 'role=pro', dua nilai yang TIDAK
// PERNAH ditulis kode mana pun, lalu jatuh ke cabang "trial habis" dan memunculkan
// paywall - padahal server (checkProAccessLive) dengan senang hati melayani orang ini.
describe('hasProAccessFor - bentuk akun seperti yang benar-benar ditulis panel admin', () => {
  it('pelanggan Pro 1 bulan (role tetap "free", trial sudah lewat) TETAP punya akses', () => {
    expect(hasProAccessFor(makeUser({
      role: 'free',
      is_pro: true,
      pro_expires_at: daysFromNow(30),
      trial_ends_at: daysFromNow(-2),
    }))).toBe(true);
  });

  it('pelanggan Pro yang masa aktifnya habis tetap mendapat akses selama testing', () => {
    expect(hasProAccessFor(makeUser({ role: 'free', is_pro: true, pro_expires_at: daysFromNow(-1) }))).toBe(true);
  });

  it('semua akun login mendapat akses; guest tetap tidak memiliki akun', () => {
    expect(hasProAccessFor(makeUser({ role: 'admin' }))).toBe(true);
    expect(hasProAccessFor(makeUser({ trial_ends_at: daysFromNow(2) }))).toBe(true);
    expect(hasProAccessFor(makeUser())).toBe(true);
    expect(hasProAccessFor(null)).toBe(false);
  });
});

/**
 * PROBE SESI: 401 ADALAH JAWABAN, BUKAN KEGAGALAN.
 *
 * Invarian ini yang paling mudah dirusak diam-diam. Kalau 401 ikut diperlakukan sebagai
 * error, `resolved` menjadi false untuk pengunjung tamu biasa - dan konsumen yang
 * mengunci UI (components/Sidebar.tsx) memasang gembok pada tamu yang sah, atau lebih
 * buruk, pada pengguna yang sudah login saat jaringan berkedip.
 *
 * Diuji lewat fetchAuthProbe + resolveAuthState (keduanya murni/tanpa DOM) alih-alih
 * merender hook-nya: repo ini tidak memasang jsdom maupun @testing-library/react.
 */
describe('fetchAuthProbe', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(init: { status: number; body?: unknown }) {
    globalThis.fetch = (async () => ({
      status: init.status,
      ok: init.status >= 200 && init.status < 300,
      json: async () => init.body,
    })) as unknown as typeof fetch;
  }

  it('401 = tamu TERKONFIRMASI, jadi resolved tetap true', async () => {
    mockFetch({ status: 401 });
    await expect(fetchAuthProbe('/api/auth/me')).resolves.toEqual({ user: null, resolved: true });
  });

  it('200 dengan sesi mengembalikan usernya', async () => {
    const user = { id: 'u1', email: 'a@b.c', role: 'free', is_pro: false, trial_ends_at: null };
    mockFetch({ status: 200, body: { authenticated: true, user } });
    await expect(fetchAuthProbe('/api/auth/me')).resolves.toEqual({ user, resolved: true });
  });

  it('200 tanpa sesi juga tamu terkonfirmasi', async () => {
    mockFetch({ status: 200, body: { authenticated: false } });
    await expect(fetchAuthProbe('/api/auth/me')).resolves.toEqual({ user: null, resolved: true });
  });

  it('500 DILEMPAR - itu "kami tidak tahu", bukan "ini tamu"', async () => {
    mockFetch({ status: 500 });
    await expect(fetchAuthProbe('/api/auth/me')).rejects.toThrow('Auth check failed: 500');
  });
});

describe('resolveAuthState', () => {
  const user = { id: 'u1', email: 'a@b.c', role: 'admin', is_pro: false, trial_ends_at: null };

  it('error apa pun membuat resolved false - UI tidak boleh menyimpulkan "tamu"', () => {
    const state = resolveAuthState({ data: undefined, error: new Error('x'), isLoading: false });
    expect(state.resolved).toBe(false);
    expect(state.user).toBeNull();
  });

  it('tamu terkonfirmasi: resolved true, user null', () => {
    const state = resolveAuthState({ data: { user: null, resolved: true }, error: undefined, isLoading: false });
    expect(state.resolved).toBe(true);
    expect(state.effectiveRole).toBe('guest');
  });

  it('error MENANG atas data lama yang masih dipegang keepPreviousData', () => {
    // keepPreviousData membuat `data` tetap terisi selama revalidasi gagal. Statusnya
    // harus tetap "tidak tahu" - kalau tidak, kegagalan berkepanjangan tampak seperti
    // sesi yang masih terverifikasi.
    const state = resolveAuthState({ data: { user, resolved: true }, error: new Error('x'), isLoading: false });
    expect(state.resolved).toBe(false);
  });

  it('meneruskan hasil computeRole', () => {
    const state = resolveAuthState({ data: { user, resolved: true }, error: undefined, isLoading: false });
    expect(state.effectiveRole).toBe('admin');
  });
});
