import { cookies } from 'next/headers';
import { decrypt, type SessionPayload } from './jwt';
import { SESSION_COOKIE } from '../constants/cookie-names';

export type { SessionPayload };

// Baca sesi JWT dari cookie HttpOnly. Ini kebutuhan LINTAS-MODULE (setiap module
// butuh tahu siapa yang sedang login untuk otorisasi), makanya tinggal di shared/
// dan bukan di modules/user/ - hanya operasi MEMBUAT/MENGHAPUS sesi (login/logout)
// yang jadi tanggung jawab domain modules/user (lihat modules/user/service/session.service.ts).
export async function getSession(): Promise<SessionPayload | null> {
  const session = cookies().get(SESSION_COOKIE)?.value;
  if (!session) return null;
  return await decrypt(session);
}

export function checkProAccess(session: SessionPayload | null): boolean {
  if (!session) return false;
  if (session.role === 'admin' || session.role === 'pro' || session.is_pro) return true;
  if (session.trial_ends_at && new Date(session.trial_ends_at) > new Date()) return true;
  return false;
}
