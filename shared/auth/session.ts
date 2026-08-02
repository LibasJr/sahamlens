import { cookies } from 'next/headers';
import { decrypt, type SessionPayload } from './jwt';
import { SESSION_COOKIE } from '../constants/cookie-names';
import { touchPresence } from './presence';
import { fetchLiveProFields } from './pro-status';

export type { SessionPayload };

// Baca sesi JWT dari cookie HttpOnly. Ini kebutuhan LINTAS-MODULE (setiap module
// butuh tahu siapa yang sedang login untuk otorisasi), makanya tinggal di shared/
// dan bukan di modules/user/ - hanya operasi MEMBUAT/MENGHAPUS sesi (login/logout)
// yang jadi tanggung jawab domain modules/user (lihat modules/user/service/session.service.ts).
export async function getSession(): Promise<SessionPayload | null> {
  const session = cookies().get(SESSION_COOKIE)?.value;
  if (!session) return null;
  const payload = await decrypt(session);
  // Guard terhadap token yang valid tanda tangannya tapi bukan sesi login asli (mis.
  // payload trial anonim yang salah ditempel sebagai cookie "session" secara manual) -
  // sesi asli SELALU punya id user string, payload lain harus ditolak di sini, bukan
  // lolos sebagai "user yang login" dengan id kosong.
  if (!payload || typeof payload.id !== 'string' || !payload.id) return null;
  // Fire-and-forget - "siapa sedang aktif" untuk panel admin, tidak boleh pernah
  // menahan atau menggagalkan request pengguna biasa kalau Redis lambat/down.
  touchPresence(payload).catch(() => {});
  return payload;
}

export function checkProAccess(session: SessionPayload | null): boolean {
  if (!session) return false;
  if (session.role === 'admin' || session.role === 'pro' || session.is_pro) return true;
  if (session.trial_ends_at && new Date(session.trial_ends_at) > new Date()) return true;
  return false;
}

// checkProAccess() sinkron cuma baca snapshot JWT - basi sampai TTL sesi (s/d
// 30 hari dengan "ingat saya") kalau admin baru saja mengaktifkan Pro lewat
// /admin (lihat modules/user/controller/admin.controller.ts
// handleSetProStatus). Versi ini re-check sekali ke DB HANYA kalau JWT bilang
// "tidak" - kalau JWT sudah bilang "ya", tidak ada query DB tambahan sama
// sekali (jalur cepat untuk mayoritas request Pro user yang sesinya masih
// segar). Gagal-aman: DB error -> tetap tolak (fail-closed), bukan meloloskan
// user yang mestinya tidak akses.
export async function checkProAccessLive(session: SessionPayload | null): Promise<boolean> {
  if (checkProAccess(session)) return true;
  if (!session) return false;
  try {
    const live = await fetchLiveProFields(session.id);
    if (!live) return false;
    return checkProAccess({ ...session, role: live.role, is_pro: live.is_pro, trial_ends_at: live.trial_ends_at });
  } catch {
    return false;
  }
}
