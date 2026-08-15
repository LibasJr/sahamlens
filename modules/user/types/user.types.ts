export type { SessionPayload } from '../../../shared/auth/jwt';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  is_verified: boolean;
  is_pro: boolean;
  created_at: string;
  /** Waktu login berhasil terakhir; null untuk akun lama yang belum login sejak fitur ini ada. */
  last_login_at?: string | null;
  /** Aktivitas request terautentikasi terakhir, ditulis maksimal sekali per 15 menit. */
  last_active_at?: string | null;
  trial_ends_at: string | null;
  /** null = tanpa batas waktu. Dipakai akun admin dan akun lama sebelum migrasi
   * 2026-08-03 - bukan jalan pintas memberi akses abadi ke pengguna biasa. */
  pro_expires_at: string | null;
  demo_ends_at: string | null;
  verification_code: string | null;
  verification_code_expires: string | null;
  reset_code: string | null;
  reset_code_expires: string | null;
}

export interface DemoSession {
  id: number;
  username: string;
  role: 'free' | 'pro' | 'admin';
}

export interface TelegramAuthData {
  id: string;
  first_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string;
  hash: string;
  [key: string]: string | undefined;
}
