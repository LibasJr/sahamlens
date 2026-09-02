import { ForbiddenError } from '@/shared/errors/app-error';
import { getSession, type SessionPayload } from './session';

/** Authorize admin consistently for browser cookies and native bearer sessions. */
export async function requireAdminSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.role !== 'admin') throw new ForbiddenError();
  return session;
}

/**
 * Native mutations have no browser Origin. They are accepted only when the request
 * carries a bearer token that has already been decrypted and resolved as an admin
 * session by requireAdminSession(). Browser mutations retain same-origin checks in
 * their route handlers.
 */
export function isNativeBearerRequest(request: Request): boolean {
  return /^Bearer\s+\S+$/i.test(request.headers.get('authorization')?.trim() ?? '');
}
