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
