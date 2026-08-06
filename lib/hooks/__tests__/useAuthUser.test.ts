import { describe, it, expect } from 'vitest';
import { computeRole, hasProAccessFor, type AuthUser } from '../useAuthUser';

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

  it('trial masih berjalan = TRIAL dengan sisa hari dibulatkan ke atas', () => {
    const r = computeRole(makeUser({ trial_ends_at: daysFromNow(6.2) }));
    expect(r.effectiveRole).toBe('trial');
    expect(r.trialDaysLeft).toBe(7);
    expect(r.isTrialExpired).toBe(false);
  });

  it('sisa trial kurang dari sehari tetap ditampilkan 1 hari, bukan 0', () => {
    expect(computeRole(makeUser({ trial_ends_at: daysFromNow(0.1) })).trialDaysLeft).toBe(1);
  });

  // Inti spesifikasi: trial habis -> role berubah jadi GUEST secara logic (tanpa
  // menulis apa pun ke database) dan modal upgrade harus terpicu.
  it('trial sudah lewat = GUEST + penanda trial habis', () => {
    const r = computeRole(makeUser({ trial_ends_at: daysFromNow(-1) }));
    expect(r.effectiveRole).toBe('guest');
    expect(r.isTrialExpired).toBe(true);
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

  it('Pro yang sudah kedaluwarsa jatuh ke GUEST', () => {
    const r = computeRole(makeUser({ is_pro: true, pro_expires_at: daysFromNow(-1), trial_ends_at: daysFromNow(-9) }));
    expect(r.effectiveRole).toBe('guest');
    expect(r.isTrialExpired).toBe(true);
  });

  it('user lama tanpa trial dan tanpa Pro = GUEST, tapi bukan "trial habis"', () => {
    const r = computeRole(makeUser());
    expect(r.effectiveRole).toBe('guest');
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

  it('pelanggan Pro yang masa aktifnya habis kehilangan akses', () => {
    expect(hasProAccessFor(makeUser({ role: 'free', is_pro: true, pro_expires_at: daysFromNow(-1) }))).toBe(false);
  });

  it('admin dan trial aktif tetap punya akses; guest tidak', () => {
    expect(hasProAccessFor(makeUser({ role: 'admin' }))).toBe(true);
    expect(hasProAccessFor(makeUser({ trial_ends_at: daysFromNow(2) }))).toBe(true);
    expect(hasProAccessFor(makeUser())).toBe(false);
    expect(hasProAccessFor(null)).toBe(false);
  });
});
