import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

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

export async function encrypt(payload: SessionPayload, expires = '24h') {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(key);
}

export async function decrypt(input: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(input, key, {
      algorithms: ['HS256'],
    });
    return payload as SessionPayload;
  } catch (error) {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const session = cookies().get('session')?.value;
  if (!session) return null;
  return await decrypt(session);
}

export async function setSession(payload: SessionPayload) {
  const session = await encrypt(payload);
  cookies().set('session', session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60, // 24 hours
  });
}

export function clearSession() {
  cookies().delete('session');
}

export function checkProAccess(session: SessionPayload | null): boolean {
  if (!session) return false;
  if (session.role === 'admin' || session.role === 'pro' || session.is_pro) return true;
  if (session.trial_ends_at && new Date(session.trial_ends_at) > new Date()) return true;
  return false;
}
