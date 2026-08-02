import { getSession, checkProAccess, checkProAccessLive, type SessionPayload } from '../auth/session';
import { UnauthorizedError, ForbiddenError } from '../errors/app-error';

// Guard reusable dipakai oleh controller di SEMUA module (bukan cuma modules/user) -
// itu sebabnya tinggal di shared/, bukan di dalam satu module tertentu. Melempar
// AppError, bukan return NextResponse - biar controller tetap framework-agnostic.

export async function requireUser(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await requireUser();
  if (session.role !== 'admin') throw new ForbiddenError();
  return session;
}

export async function requirePro(): Promise<SessionPayload> {
  const session = await requireUser();
  if (!(await checkProAccessLive(session))) throw new ForbiddenError('Limit analisa harian habis');
  return session;
}
