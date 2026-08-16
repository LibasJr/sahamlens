import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

// Admin tokens use a distinct signing domain from normal user sessions. In production,
// set ADMIN_JWT_SECRET to an independent random secret. Production fails closed if it is
// missing: reusing/deriving from the normal session signing secret expands the blast radius
// of one secret and makes credential rotation less auditable. Non-production may derive a
// domain-separated test/dev key so local tests do not require production secrets.
const ADMIN_TOKEN_TTL_SECONDS = 8 * 60 * 60;
let cachedAdminKey: Uint8Array | null = null;

function getAdminJwtKey(): Uint8Array {
  if (cachedAdminKey) return cachedAdminKey;
  const dedicated = process.env.ADMIN_JWT_SECRET?.trim();
  if (dedicated) {
    cachedAdminKey = new TextEncoder().encode(dedicated);
    return cachedAdminKey;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ADMIN_JWT_SECRET wajib diset terpisah di production.');
  }
  const base = process.env.JWT_SECRET_KEY?.trim();
  if (!base) throw new Error('ADMIN_JWT_SECRET atau JWT_SECRET_KEY wajib diset untuk token admin non-production.');
  const derived = crypto.createHash('sha256').update(`sahamlens:admin:v1:${base}`).digest();
  cachedAdminKey = new Uint8Array(derived);
  return cachedAdminKey;
}

export interface AdminTokenPayload {
  admin: true;
  /** Incremented whenever the database admin secret changes. */
  ver: number;
  jti: string;
  iat?: number;
  exp?: number;
}

export async function signAdminToken(sessionVersion = 1): Promise<string> {
  const jti = crypto.randomUUID();
  return new SignJWT({ admin: true, ver: sessionVersion, jti })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setJti(jti)
    .setExpirationTime(`${ADMIN_TOKEN_TTL_SECONDS}s`)
    .sign(getAdminJwtKey());
}

export async function readAdminToken(value: string | undefined | null): Promise<AdminTokenPayload | null> {
  if (!value) return null;
  const key = getAdminJwtKey();
  try {
    const { payload } = await jwtVerify(value, key, { algorithms: ['HS256'] });
    if (payload.admin !== true) return null;
    const ver = Number(payload.ver);
    const jti = typeof payload.jti === 'string' ? payload.jti : null;
    if (!Number.isInteger(ver) || ver < 0 || !jti) return null;
    return {
      admin: true,
      ver,
      jti,
      iat: typeof payload.iat === 'number' ? payload.iat : undefined,
      exp: typeof payload.exp === 'number' ? payload.exp : undefined,
    };
  } catch {
    return null;
  }
}

/** Cryptographic verification only. API authorization additionally checks the live DB version. */
export async function verifyAdminToken(value: string | undefined | null): Promise<boolean> {
  return (await readAdminToken(value))?.admin === true;
}

export const ADMIN_SESSION_MAX_AGE_SECONDS = ADMIN_TOKEN_TTL_SECONDS;
