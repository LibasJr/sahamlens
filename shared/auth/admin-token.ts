import { decrypt, encrypt } from './jwt';

// Cookie admin dulu berisi konstanta '1' (ADMIN_COOKIE_VALUE). HttpOnly hanya
// mencegah JavaScript MEMBACA cookie - ia tidak pernah mencegah klien MENGIRIM
// nilai apa pun. Siapa pun bisa `curl -H "Cookie: sahamlens_admin=1"` dan lolos
// sebagai admin tanpa login. Nilainya sekarang JWT bertanda tangan HS256 dengan
// kunci yang sama seperti sesi, jadi tidak bisa dibuat tanpa JWT_SECRET_KEY.
//
// Modul ini sengaja tidak mengimpor next/headers atau pg supaya tetap bisa dipakai
// dari proxy.ts - lihat catatan Edge-safe di shared/constants/cookie-names.ts.

const ADMIN_TOKEN_TTL = '30d';

interface AdminTokenPayload {
  admin: true;
}

export async function signAdminToken(): Promise<string> {
  return encrypt<AdminTokenPayload>({ admin: true }, ADMIN_TOKEN_TTL);
}

/**
 * True hanya untuk token yang ditandatangani signAdminToken().
 *
 * Klaim `admin === true` wajib diperiksa, bukan cuma tanda tangannya. Cookie sesi
 * login biasa dan cookie trial anonim ditandatangani dengan kunci yang sama, jadi
 * keduanya lolos jwtVerify - tanpa cek klaim ini, user biasa cukup menyalin cookie
 * `session` miliknya sendiri ke `sahamlens_admin` untuk jadi admin.
 */
export async function verifyAdminToken(value: string | undefined | null): Promise<boolean> {
  if (!value) return false;
  const payload = await decrypt<Partial<AdminTokenPayload>>(value);
  return payload?.admin === true;
}
