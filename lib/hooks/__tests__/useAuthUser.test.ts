import { describe, it, expect } from 'vitest';
import { computeRole, type AuthUser } from '../useAuthUser';

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
