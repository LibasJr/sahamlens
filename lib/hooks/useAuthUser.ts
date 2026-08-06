'use client';

import { useEffect, useState } from 'react';

// Bentuk minimal payload sesi dari /api/auth/me (lihat shared/auth/jwt.ts
// SessionPayload) - hanya field yang dipakai untuk keputusan role/trial di sini.
export interface AuthUser {
  id: string;
  email: string;
  role: string;
  is_pro: boolean;
  trial_ends_at: string | null;
  pro_expires_at?: string | null;
}

// Role Sistem Akses (3 tingkat sesuai spesifikasi produk): GUEST (belum login
// ATAU trial 7 hari sudah habis tanpa Pro aktif), TRIAL (login & masih dalam
// masa trial/Pro aktif), ADMIN (akses penuh tanpa batas). "Pro" tidak jadi role
// terpisah - user Pro dapat menu yang sama dengan TRIAL (paritas fitur berbayar
// vs trial), bedanya cuma tidak ada hitung mundur.
export type EffectiveRole = 'guest' | 'trial' | 'admin';

export interface AuthState {
  loading: boolean;
  user: AuthUser | null;
  effectiveRole: EffectiveRole;
  /** Sisa hari trial (dibulatkan ke atas, minimal 1) - null kalau bukan trial murni
   * (Pro aktif, admin, atau guest) sehingga tidak perlu badge hitung mundur. */
  trialDaysLeft: number | null;
  /** True kalau user PERNAH tercatat trial dan sudah lewat trial_ends_at, tanpa Pro
   * aktif - dipakai untuk memicu modal "Trial habis" sekali per sesi (lihat AppShell). */
  isTrialExpired: boolean;
}

// Diekspor supaya bisa diuji tanpa merender komponen - ini fungsi murni, seluruh
// keputusan role ada di sini (hook di bawah cuma menyediakan datanya).
export function computeRole(user: AuthUser | null): Omit<AuthState, 'loading' | 'user'> {
  if (!user) return { effectiveRole: 'guest', trialDaysLeft: null, isTrialExpired: false };
  if (user.role === 'admin') return { effectiveRole: 'admin', trialDaysLeft: null, isTrialExpired: false };

  const now = Date.now();
  const proActive = user.is_pro && (!user.pro_expires_at || new Date(user.pro_expires_at).getTime() > now);
  if (proActive) return { effectiveRole: 'trial', trialDaysLeft: null, isTrialExpired: false };

  if (user.trial_ends_at) {
    const trialEndMs = new Date(user.trial_ends_at).getTime();
    if (trialEndMs > now) {
      const daysLeft = Math.max(1, Math.ceil((trialEndMs - now) / (24 * 60 * 60 * 1000)));
      return { effectiveRole: 'trial', trialDaysLeft: daysLeft, isTrialExpired: false };
    }
    // Trial pernah ada dan sudah lewat -> "ubah role secara logic menjadi GUEST"
    // (tidak menulis apa pun ke DB - checkProAccess() di API sudah menolak akses
    // Pro pada kondisi ini juga, ini murni cermin UI dari logic yang sama).
    return { effectiveRole: 'guest', trialDaysLeft: null, isTrialExpired: true };
  }

  return { effectiveRole: 'guest', trialDaysLeft: null, isTrialExpired: false };
}

export function useAuthUser(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((d) => { if (d.authenticated && d.user) setUser(d.user); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { loading, user, ...computeRole(user) };
}
