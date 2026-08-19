'use client';

import useSWR from 'swr';
import { TESTING_OPEN_ACCESS } from '@/shared/constants/access';

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
}

// Diekspor supaya bisa diuji tanpa merender komponen - ini fungsi murni, seluruh
// keputusan role ada di sini (hook di bawah cuma menyediakan datanya).
export function computeRole(user: AuthUser | null): Omit<AuthState, 'loading' | 'user' | 'resolved'> {
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
    const res = await fetch('/api/auth/me');
    const d = await res.json();
    return d?.authenticated && d.user ? hasProAccessFor(d.user) : false;
  } catch {
    return false;
  }
}

/** Kunci SWR bersama untuk sesi. Satu string, jadi SELURUH pemakai berbagi satu entri. */
export const AUTH_ME_KEY = '/api/auth/me';

/**
 * Hasil pembacaan sesi yang MEMBEDAKAN "tamu terkonfirmasi" dari "tidak tahu".
 * Perbedaan itu tidak bisa diwakili oleh `data`/`error` bawaan SWR: 401 harus jadi
 * jawaban SUKSES yang berarti "belum login", bukan error - kalau ia dilempar sebagai
 * error, `resolved` akan false dan UI memasang gembok pada tamu yang sah.
 */
export interface AuthProbe {
  user: AuthUser | null;
  resolved: boolean;
}

/**
 * Fetcher khusus untuk sesi. Sengaja TIDAK memakai apiFetcher: bagi endpoint ini 401
 * bukan kegagalan, melainkan jawaban yang lengkap dan benar.
 *
 * Yang dilempar hanyalah kegagalan yang benar-benar berarti "kami tidak tahu" -
 * jaringan putus atau 5xx. Hanya itu yang boleh membuat `resolved` false, dan itulah
 * yang menjaga invarian yang sudah ditulis panjang di komentar AuthState di atas:
 * user yang sudah login TIDAK boleh diperlakukan sebagai tamu hanya karena jaringan
 * berkedip.
 */
export async function fetchAuthProbe(url: string): Promise<AuthProbe> {
  const res = await fetch(url, { credentials: 'include' });

  // 401 = Guest terkonfirmasi. Jawaban yang sah, bukan error.
  if (res.status === 401) return { user: null, resolved: true };

  // 5xx / respons tak terduga = kami TIDAK TAHU. Dilempar supaya SWR mengulanginya,
  // dan supaya cabang error di bawah menyetel resolved: false.
  if (!res.ok) throw new Error(`Auth check failed: ${res.status}`);

  const d = await res.json();
  return { user: d?.authenticated && d.user ? (d.user as AuthUser) : null, resolved: true };
}

/**
 * MENGGANTI useEffect + fetch per-komponen, dan sekaligus menghapus heartbeat 90 detik
 * yang dulu ada di components/AppShell.tsx.
 *
 * Dua masalah yang diselesaikan sekaligus:
 *
 *   1. DUPLIKASI. Hook ini dipakai 15 komponen, dan versi lamanya menjalankan satu
 *      useEffect+fetch DI SETIAP pemakai. Di /dashboard itu berarti TopMarketBar,
 *      TrialCountdown, SmartBackNavigation, dan halamannya sendiri masing-masing
 *      menembak /api/auth/me pada saat yang sama - ditambah tiga fetch langsung di
 *      halaman lain. Kunci SWR yang sama membuat semuanya berbagi SATU permintaan.
 *
 *   2. HEARTBEAT YANG MEMBOROSKAN. AppShell dulu memukul /api/auth/me tiap 90 detik
 *      dari SETIAP tab yang terbuka - sekitar 960 permintaan per hari per tab, hanya
 *      untuk mencatat kehadiran. Interval di bawah 5 kali lebih longgar, DAN berhenti
 *      sendiri saat tab tidak terlihat (refreshWhenHidden: false) - yang dulu diurus
 *      tangan dengan memeriksa document.visibilityState.
 *
 * Nilai kembaliannya identik dengan versi sebelumnya, jadi 15 pemakai tidak berubah.
 */
export function useAuthUser(): AuthState {
  const { data, error, isLoading } = useSWR<AuthProbe>(AUTH_ME_KEY, fetchAuthProbe, {
    // Presensi: pengganti heartbeat. 7,5 menit, bukan 90 detik.
    refreshInterval: 450_000,
    // Tab di latar belakang tidak perlu melaporkan kehadiran.
    refreshWhenHidden: false,
    // Status sesi tidak berubah tiap detik; jendela dedupe lebih lebar dari default
    // supaya beberapa komponen yang mount berbarengan benar-benar berbagi satu request.
    dedupingInterval: 30_000,
    // Sesi yang sudah diketahui DIPERTAHANKAN selama revalidasi. Tanpa ini setiap
    // penyegaran berkala sempat mengembalikan `user: null` dan seluruh menu berkedip
    // jadi tampilan tamu.
    keepPreviousData: true,
  });

  return resolveAuthState({ data, error, isLoading });
}

/**
 * Keputusan akhir dari hasil SWR, DIPISAH sebagai fungsi murni supaya invarian
 * `resolved` bisa diuji tanpa DOM (repo ini tidak memasang jsdom maupun
 * @testing-library/react, dan menambah keduanya hanya untuk satu hook tidak sepadan).
 *
 * Invarian yang dijaga di sini adalah yang paling mudah dirusak diam-diam saat
 * refactor: `resolved` bernilai false HANYA kalau probe-nya benar-benar gagal. Kalau
 * suatu saat 401 ikut dilempar sebagai error, nilai ini jadi false untuk tamu biasa -
 * dan seluruh menu memasang gembok pada pengunjung yang sah. Lihat komentar panjang
 * pada AuthState di atas.
 */
export function resolveAuthState(input: {
  data: AuthProbe | undefined;
  error: unknown;
  isLoading: boolean;
}): AuthState {
  const user = input.data?.user ?? null;
  return {
    loading: input.isLoading,
    user,
    resolved: input.error ? false : (input.data?.resolved ?? true),
    ...computeRole(user),
  };
}
