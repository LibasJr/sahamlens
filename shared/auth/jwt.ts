import { SignJWT, jwtVerify } from 'jose';

// Modul JWT murni - tanpa next/headers, tanpa I/O selain verifikasi tanda tangan.
// Edge-safe (dipakai langsung oleh middleware.ts) maupun Node-safe (dipakai oleh
// shared/auth/session.ts dan modules/user).

const secretKey = process.env.JWT_SECRET_KEY;
if (!secretKey) {
  throw new Error('JWT_SECRET_KEY env var wajib diset - lihat .env.local. Aplikasi tidak boleh berjalan dengan secret hardcoded.');
}
const key = new TextEncoder().encode(secretKey);

export interface SessionPayload {
  id: string;
  email: string;
  role: 'admin' | 'user' | 'free' | 'pro' | string;
  is_pro: boolean;
  trial_ends_at: string | null;
  [key: string]: any;
}

// Generic (bukan cuma SessionPayload) - dipakai juga oleh shared/auth/anonymous-trial.ts
// untuk menandatangani payload trial pengunjung anonim, bukan cuma sesi login. Default
// generic tetap SessionPayload supaya pemanggil lama (shared/auth/session.ts,
// middleware.ts) tidak perlu diubah sama sekali.
export async function encrypt<T extends object>(payload: T, expires = '24h'): Promise<string> {
  return await new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(key);
}

export async function decrypt<T = SessionPayload>(input: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(input, key, { algorithms: ['HS256'] });
    return payload as unknown as T;
  } catch {
    return null;
  }
}
