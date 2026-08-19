'use client';

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { TESTING_OPEN_ACCESS } from '@/shared/constants/access';
import { apiRequest, isApiClientError } from '@/shared/http/api-client';

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
  /** False kalau /api/auth/me GAGAL dihubungi (network error), bukan kalau server
   * menjawab "belum login". Bedanya penting: `user === null` karena jaringan putus
   * TIDAK boleh diperlakukan sebagai "ini guest" lalu memasang gembok + tautan login
   * di menu untuk user yang sebetulnya sudah masuk. Konsumen yang mengunci UI harus
   * mensyaratkan `resolved === true` dulu (lihat components/Sidebar.tsx). */
  resolved: boolean;
  effectiveRole: EffectiveRole;
  /** Sisa hari trial (dibulatkan ke atas, minimal 1) - null kalau bukan trial murni
   * (Pro aktif, admin, atau guest) sehingga tidak perlu badge hitung mundur. */
  trialDaysLeft: number | null;
  /** True kalau user PERNAH tercatat trial dan sudah lewat trial_ends_at, tanpa Pro
   * aktif - dipakai untuk memicu modal "Trial habis" sekali per sesi (lihat AppShell). */
  isTrialExpired: boolean;
  /** Paksa sinkronisasi ulang sesi setelah login/logout/verify tanpa membuat setiap
   * consumer kembali memiliki fetch /api/auth/me sendiri. */
  refresh: () => Promise<void>;
}

// Diekspor supaya bisa diuji tanpa merender komponen - ini fungsi murni, seluruh
// keputusan role ada di sini (hook di bawah cuma menyediakan datanya).
export function computeRole(user: AuthUser | null): Omit<AuthState, 'loading' | 'user' | 'resolved' | 'refresh'> {
  if (!user) return { effectiveRole: 'guest', trialDaysLeft: null, isTrialExpired: false };
  if (user.role === 'admin') return { effectiveRole: 'admin', trialDaysLeft: null, isTrialExpired: false };
  if (TESTING_OPEN_ACCESS) return { effectiveRole: 'trial', trialDaysLeft: null, isTrialExpired: false };

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

/** Padanan client dari checkProAccess() di server (shared/auth/session.ts).
 *
 * PENTING: satu-satunya cara benar memeriksa status Pro di sisi client. JANGAN
 * memeriksa `role === 'pro'` atau cookie `role=pro` - panel admin mengaktifkan
 * langganan dengan HANYA menulis is_pro + pro_expires_at, kolom `role` tidak
 * pernah disentuh, jadi dua pemeriksaan itu selalu salah untuk pelanggan asli. */
export function hasProAccessFor(user: AuthUser | null): boolean {
  return computeRole(user).effectiveRole !== 'guest';
}

/** Ambil sesi sekali dan putuskan akses Pro - dipakai kode non-React (lib/limits.ts).
 * Gagal-tertutup: kalau /api/auth/me tidak bisa dihubungi, jawab false, bukan
 * memberi akses penuh karena jaringan bermasalah. */
export async function fetchProAccess(): Promise<boolean> {
  try {
    const d = await apiRequest<{ authenticated?: boolean; user?: AuthUser | null }>('/api/auth/me');
    return d?.authenticated && d.user ? hasProAccessFor(d.user) : false;
  } catch {
    return false;
  }
}

const AuthUserContext = createContext<AuthState | null>(null);

function useAuthUserState(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolved, setResolved] = useState(true);

  const resolveAuth = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const d = await apiRequest<{ authenticated?: boolean; user?: AuthUser | null }>('/api/auth/me', { signal });
      setUser(d.authenticated && d.user ? d.user : null);
      setResolved(true);
    } catch (error) {
      if (isApiClientError(error) && error.code === 'UNAUTHENTICATED') {
        // 401 adalah response normal saat user belum login (Guest terkonfirmasi).
        setUser(null);
        setResolved(true);
        return;
      }
      // Jaringan putus/server error 500 = kita TIDAK TAHU statusnya, bukan guest.
      if ((error as Error)?.name !== 'AbortError') setResolved(false);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void resolveAuth(controller.signal);
    return () => controller.abort();
  }, [resolveAuth]);

  const refresh = useCallback(async () => {
    await resolveAuth();
  }, [resolveAuth]);

  return useMemo(
    () => ({ loading, user, resolved, refresh, ...computeRole(user) }),
    [loading, user, resolved, refresh],
  );
}

/**
 * Satu pemilik request /api/auth/me untuk seluruh AppShell. Sebelum provider ini,
 * setiap pemanggil useAuthUser() (Sidebar, MobileNav, TopMarketBar, halaman, dst.)
 * membuat request identik sendiri-sendiri pada mount.
 */
export function AuthUserProvider({ children }: { children: ReactNode }) {
  const value = useAuthUserState();
  return createElement(AuthUserContext.Provider, { value }, children);
}

export function useAuthUser(): AuthState {
  const context = useContext(AuthUserContext);
  if (!context) {
    throw new Error('useAuthUser harus dipakai di dalam AuthUserProvider');
  }
  return context;
}
