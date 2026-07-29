// Admin auth - server-verified, tanpa login beneran (belum pasang NextAuth).
//
// Dua jalur masuk, dua-duanya berakhir set cookie HttpOnly yang sama (ADMIN_COOKIE):
// 1. app/admin-login/key/route.ts - key rahasia (ADMIN_SECRET_KEY) via URL, dicek server-side.
// 2. app/api/auth/telegram/route.ts - Telegram Login Widget, HMAC-verified via verifyTelegramAuth().
//
// PENTING soal keamanan: ADMIN_SECRET_KEY & TELEGRAM_BOT_TOKEN HANYA pernah dibaca di server
// (lewat process.env). Kalau dibandingkan langsung di client (mis. lib client component baca
// process.env.NEXT_PUBLIC_...), Next.js akan meng-inline nilainya ke JS bundle publik - siapa
// pun tinggal buka devtools/view-source, ambil string-nya, dan permanen jadi admin gratis.
// Makanya verifikasi selalu di server, hasilnya baru disimpan sebagai cookie HttpOnly yang
// tidak bisa dibaca/diforge oleh JS di browser.
//
// Konsekuensinya: untuk mengecek status admin di client (badge, unlock UI), komponen client
// harus fetch /api/admin-status, bukan membaca cookie/secret langsung.

import crypto from 'crypto';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE, ADMIN_COOKIE_VALUE } from '@/lib/constants';

export { ADMIN_COOKIE, ADMIN_COOKIE_VALUE };

export const USER_COOKIE = 'sahamlens_user';

// Cookie sesi akun Demo/Paper Trading (data/users.json) - terpisah total dari ADMIN_COOKIE
// di atas. Sengaja TIDAK PERNAH menyimpan role admin/pro di sini, supaya akun demo yang
// signup/login lewat halaman /portfolio tidak pernah kebawa bypass akses admin situs.
export const DEMO_SESSION_COOKIE = 'sahamlens_demo_session';

export interface DemoSession {
  id: number;
  username: string;
  role: 'free' | 'pro' | 'admin';
}

/** Hash password dengan scrypt (salt acak per-password), disimpan sebagai "salt:hash" hex. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

/** Baca & parse cookie sesi demo di server (route handler). Null kalau tidak ada/invalid. */
export function getDemoSession(cookieStore: { get(name: string): { value: string } | undefined }): DemoSession | null {
  const raw = cookieStore.get(DEMO_SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.id === 'number' && typeof parsed?.username === 'string') return parsed;
    return null;
  } catch {
    return null;
  }
}

export function getAdminSecret(): string | undefined {
  return process.env.ADMIN_SECRET_KEY;
}

export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean);
}

/** Terima ADMIN_TELEGRAM_ID (satu) maupun ADMIN_TELEGRAM_IDS (daftar, dipisah koma). */
export function getAdminTelegramIds(): string[] {
  const single = process.env.ADMIN_TELEGRAM_ID ? [process.env.ADMIN_TELEGRAM_ID] : [];
  const list = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  return Array.from(new Set([...single, ...list]));
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

/**
 * Verifikasi data dari Telegram Login Widget sesuai algoritma resmi Telegram:
 * https://core.telegram.org/widgets/login#checking-authorization
 * secret_key = SHA256(bot_token); check_string = "key=value" (selain hash) diurutkan & digabung "\n";
 * valid kalau HMAC-SHA256(check_string, secret_key) === data.hash.
 */
export function verifyTelegramAuth(data: Record<string, string>): boolean {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !data.hash) return false;

  const { hash, ...rest } = data;
  const checkString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('\n');

  const secret = crypto.createHash('sha256').update(token).digest();
  const hmac = crypto.createHmac('sha256', secret).update(checkString).digest('hex');

  if (hmac.length !== hash.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(hash))) return false;

  // Tolak link login yang sudah lebih dari 1 hari (cegah replay kalau URL lama ke-share ulang).
  const authDate = Number(data.auth_date) * 1000;
  if (!authDate || Date.now() - authDate > 24 * 60 * 60 * 1000) return false;

  return true;
}

/** Dipanggil di server (route handler / server component) - baca cookie HttpOnly. */
export function isAdminFromRequestCookies(cookieStore: { get(name: string): { value: string } | undefined }): boolean {
  return cookieStore.get(ADMIN_COOKIE)?.value === ADMIN_COOKIE_VALUE;
}

/** Shortcut untuk dipakai di Server Component / Route Handler App Router. */
export function isAdminServer(): boolean {
  try {
    return isAdminFromRequestCookies(cookies());
  } catch {
    return false;
  }
}

/**
 * Placeholder untuk hari kalau NextAuth beneran dipasang: role ditentukan dari
 * session.user.email / telegramId, dibandingkan ke ADMIN_EMAILS / ADMIN_TELEGRAM_IDS.
 * Belum dipakai sekarang karena app ini belum punya sistem login.
 */
export function resolveRoleFromSession(session: { user?: { email?: string; telegramId?: string } } | null): 'admin' | 'pro' | 'free' {
  if (!session?.user) return 'free';
  const { email, telegramId } = session.user;
  if ((email && getAdminEmails().includes(email)) || (telegramId && getAdminTelegramIds().includes(telegramId))) {
    return 'admin';
  }
  return 'free';
}
