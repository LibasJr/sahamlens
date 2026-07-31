import crypto from 'crypto';
import { ForbiddenError } from '../../../shared/errors/app-error';
import { ADMIN_COOKIE, ADMIN_COOKIE_VALUE, ADMIN_BADGE_COOKIE, ROLE_BADGE_COOKIE, TELEGRAM_USER_COOKIE } from '../../../shared/constants/cookie-names';
import { getAdminSecret, getAdminTelegramIds, verifyTelegramAuth, upsertTelegramUser } from '../service/telegram-auth.service';
import { isAdminFromRequestCookies, getAdminStatsToday, getAdminExportData } from '../service/admin.service';
import type { HttpResult, CookieToSet } from '../../../shared/types/http-result.types';

const THIRTY_DAYS = 60 * 60 * 24 * 30;

function adminCookies(): CookieToSet[] {
  return [
    { name: ADMIN_COOKIE, value: ADMIN_COOKIE_VALUE, options: { httpOnly: true, sameSite: 'lax', path: '/', maxAge: THIRTY_DAYS } },
    // Non-HttpOnly, HANYA untuk badge UI client-side - lihat catatan di
    // shared/constants/cookie-names.ts. Middleware/keputusan server TIDAK memercayai ini.
    { name: ADMIN_BADGE_COOKIE, value: 'true', options: { httpOnly: false, sameSite: 'lax', path: '/', maxAge: THIRTY_DAYS } },
    { name: ROLE_BADGE_COOKIE, value: 'admin', options: { httpOnly: false, sameSite: 'lax', path: '/', maxAge: THIRTY_DAYS } },
  ];
}

// Perbandingan timing-safe (code review M5) - `!==` biasa membocorkan info lewat
// waktu eksekusi (berhenti di karakter pertama yang beda), memungkinkan secret
// ditebak byte-per-byte lewat pengukuran waktu berulang. Pola sama dengan
// verifyTelegramAuth di telegram-auth.service.ts, disamakan di sini.
function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Key salah / env var belum di-set -> 404 (tidak membocorkan bahwa route ini ada).
export async function handleAdminLoginByKey(key: string | null): Promise<HttpResult> {
  const secret = getAdminSecret();
  if (!secret || !key || !timingSafeStringEqual(key, secret)) {
    return { status: 404, body: { error: 'Not found' } };
  }
  return { status: 302, body: null, redirectTo: '/dashboard', cookiesToSet: adminCookies() };
}

export async function handleTelegramLogin(params: Record<string, string>): Promise<HttpResult> {
  if (!params.hash || !params.id || !verifyTelegramAuth(params)) {
    return { status: 302, body: null, redirectTo: '/admin-login?error=invalid' };
  }

  const telegram_id = Number(params.id);
  const isAdmin = getAdminTelegramIds().includes(String(params.id));

  // Akses data dipindah ke service (code review H2) - controller cuma orkestrasi
  // HTTP (verifikasi, redirect, cookie), bukan menyentuh supabaseAdmin langsung.
  await upsertTelegramUser(telegram_id, { username: params.username, first_name: params.first_name }, isAdmin);

  const cookiesToSet: CookieToSet[] = [
    {
      name: TELEGRAM_USER_COOKIE,
      value: JSON.stringify({ id: params.id, name: params.first_name || params.username || 'User', username: params.username || null }),
      options: { httpOnly: false, sameSite: 'lax', path: '/', maxAge: THIRTY_DAYS },
    },
  ];
  if (isAdmin) cookiesToSet.push(...adminCookies());

  return { status: 302, body: null, redirectTo: '/dashboard', cookiesToSet };
}

export async function handleAdminStatus(cookieStore: { get(name: string): { value: string } | undefined }): Promise<HttpResult> {
  return { status: 200, body: { isAdmin: isAdminFromRequestCookies(cookieStore) } };
}

export async function handleAdminStats(cookieStore: { get(name: string): { value: string } | undefined }): Promise<HttpResult> {
  if (!isAdminFromRequestCookies(cookieStore)) throw new ForbiddenError();
  return { status: 200, body: getAdminStatsToday() };
}

export async function handleAdminExport(
  cookieStore: { get(name: string): { value: string } | undefined },
  query: { cursor?: string; limit?: string } = {}
): Promise<HttpResult> {
  if (!isAdminFromRequestCookies(cookieStore)) throw new ForbiddenError();
  const data = await getAdminExportData({ cursor: query.cursor, limit: query.limit ? Number(query.limit) : undefined });
  return { status: 200, body: { success: true, ...data } };
}
